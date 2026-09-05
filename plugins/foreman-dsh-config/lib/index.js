import z from "@deepseek-ai/schemastery";
import fs from "node:fs";

/**
 * Foreman config, host half.
 *
 * Registers the `foreman` settings namespace (provider / model / effort) with
 * this composition entry as the base layer. User edits made in the DSH
 * settings UI land as user overrides; the watcher applies every committed
 * change to the foreman preset's `agentOptions` block, so a change reaches the
 * worker lane IN-BAND on every request and applies to NEW sessions on the
 * preset — no worker restart is ever involved:
 *   - provider/model → the delegation route binding;
 *   - effort → `agentOptions.reasoningEffort`, dispatched per request by pi-ai
 *     as the OpenAI-style `reasoning_effort` field (the qwen-daily models
 *     declare `reasoningEfforts` and the route's compat gate is on; llama-server
 *     accepts the field — verified 2026-09-06). The bat-level env var
 *     (LLAMA_ARG_CHAT_TEMPLATE_KWARGS) stays as a server-default fallback.
 *
 * Deliberately ABSENT: the former autoRestartWorker (kill + relaunch) and the
 * worker .bat rewriter. Both were hardcoded to the daily profile script, so a
 * UI edit silently downgraded a running extreme/heavy worker to 96K; and
 * effort now propagates in-band, which removes the only reason a restart
 * existed. Profile switching (daily/extreme/200k) = picking the matching model
 * id here; start that profile's script under local-dev-agent/scripts.
 */

export const name = "foreman-config";
export const inject = ["settings"];

const PRESET_YML = "C:/Users/admin/.dsh/.agent-presets/foreman/agent.cordis.yml";
const EFFORTS = ["low", "medium", "xhigh"];

export const Config = z.object({
	provider: z.string().default("qwen-daily"),
	model: z.string().default("qwen3.8-daily"),
	effort: z.string().default("low")
});

function getYmlBinding(text) {
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*agentOptions:\s*$/.test(lines[i])) {
			const provider = (lines[i + 1] || "").match(/provider:\s*(\S+)/);
			const model = (lines[i + 2] || "").match(/model:\s*(\S+)/);
			if (provider && model) return { provider: provider[1], model: model[1], line: i };
		}
	}
	return null;
}

function applyToFiles(next, log) {
	const notes = [];
	try {
		const yml = fs.readFileSync(PRESET_YML, "utf8");
		const lines = yml.split("\n");
		const binding = getYmlBinding(yml);
		if (!binding) {
			notes.push("WARN: preset yml agentOptions block not found — binding not applied");
		} else {
			let changed = false;
			if (next.provider && next.provider !== binding.provider) {
				lines[binding.line + 1] = lines[binding.line + 1].replace(/provider:\s*\S+/, `provider: ${next.provider}`);
				changed = true;
				notes.push(`preset provider → ${next.provider}`);
			}
			if (next.model && next.model !== binding.model) {
				lines[binding.line + 2] = lines[binding.line + 2].replace(/model:\s*\S+/, `model: ${next.model}`);
				changed = true;
				notes.push(`preset model → ${next.model}`);
			}
			if (next.effort && EFFORTS.includes(next.effort)) {
				const effortLine = `reasoningEffort: ${next.effort}`;
				const after = lines[binding.line + 3] || "";
				if (after.trim() === effortLine) {
					// already correct
				} else if (/^\s*reasoningEffort:/.test(after)) {
					lines[binding.line + 3] = after.replace(/reasoningEffort:\s*\S+/, effortLine);
					changed = true;
					notes.push(`preset reasoningEffort → ${next.effort}`);
				} else {
					const indent = (lines[binding.line + 1].match(/^\s*/) || [""])[0];
					lines.splice(binding.line + 3, 0, `${indent}${effortLine}`);
					changed = true;
					notes.push(`preset reasoningEffort → ${next.effort} (inserted)`);
				}
			}
			if (changed) fs.writeFileSync(PRESET_YML, lines.join("\n"), "utf8");
		}
	} catch (e) {
		notes.push(`WARN: preset yml write failed: ${String(e.message || e)}`);
	}
	if (notes.length) log(notes.join("; "));
}

export function apply(ctx, config) {
	const scope = ctx.settings.register("foreman", Config, { base: config });

	const log = (msg) => ctx.logger?.info?.(`[foreman-config] ${msg}`) ?? console.log(`[foreman-config] ${msg}`);

	const run = (next, cause) => {
		const collected = [];
		applyToFiles(next, (n) => collected.push(n));
		if (collected.length) log(`${cause ?? "mount"}: ${collected.join("; ")}`);
	};

	run(scope.get(), "mount");
	scope.watch((next) => run(next, "user"));
}
