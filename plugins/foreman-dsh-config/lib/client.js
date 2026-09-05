window.__ModuleLoader__.load({
	id: "foreman-dsh-config",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		//#region client/ForemanCard.js — vanilla React card over the `foreman` settings scope
		const FIELDS = [
			{ key: "provider", label: "provider（须与 settings.yaml 已注册条目一致）", kind: "text" },
			{ key: "model", label: "model id（须与 settings.yaml 已注册条目一致）", kind: "text" },
			{ key: "effort", label: "工人思考等级（low 推荐；对新会话逐请求生效，无需重启工人）", kind: "select", options: ["low", "medium", "xhigh"] }
		];
		const inputStyle = {
			width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6,
			border: "1px solid var(--dsw-alias-border, rgba(127,127,127,.45))",
			background: "var(--dsw-alias-input-bg, transparent)",
			color: "inherit", font: "inherit", fontSize: 13
		};

		/**
		 * The foreman card inside the Plugin configuration tab. Renders the
		 * resolved `foreman` namespace, stages edits locally, and writes each
		 * field through the revision-fenced settings scope on save.
		 */
		function ForemanCard({ scope }) {
			const [snap, setSnap] = react.useState(scope.getSnapshot());
			const [draft, setDraft] = react.useState(null);
			const [msg, setMsg] = react.useState("");
			react.useEffect(() => scope.subscribe(() => {
				const next = scope.getSnapshot();
				setSnap(next);
				setDraft(null);
			}), [scope]);

			const value = draft || {};
			const resolved = snap && snap.value ? snap.value : {};
			const writable = !snap || snap.writable !== false;
			const stage = (key, v) => setDraft(Object.assign({}, draft, { [key]: v }));

			const save = async () => {
				setMsg("保存中…");
				try {
					for (const f of FIELDS) {
						if (draft && Object.prototype.hasOwnProperty.call(draft, f.key)) {
							let v = draft[f.key];
							if (f.kind === "checkbox") v = !!v;
							await scope.set(f.key, v);
						}
					}
					setDraft(null);
					setSnap(scope.getSnapshot());
					setMsg("已保存（对新会话生效；思考等级逐请求下发，无需重启工人）");
				} catch (e) {
					setMsg("保存失败：" + String(e && e.message || e));
				}
			};

			const el = react.createElement;
			const ready = snap && snap.status === "ready" && snap.value;
			return el("div", { style: { display: "grid", gap: 10, fontSize: 13 } },
				el("div", { style: { borderBottom: "1px solid var(--dsw-alias-border, rgba(127,127,127,.35))", paddingBottom: 8, marginBottom: 4 } },
					el("div", { style: { fontWeight: 700, fontSize: 15 } }, "Foreman 本地工人配置"),
					el("div", { style: { fontSize: 12, opacity: 0.75, marginTop: 4 } },
						"delegate_worker 委托通道的绑定与思考等级。改动回写到 Foreman preset 的 agentOptions（provider/model/思考等级），对新会话生效、思考等级逐请求下发，无需重启工人。")),
				!ready ? el("div", null, snap && snap.status === "loading" ? "设置加载中…" : "命名空间不可用（foreman-config 未运行或未暴露给此客户端）") :
					FIELDS.map((f) => {
						const current = draft && Object.prototype.hasOwnProperty.call(draft, f.key) ? value[f.key] : resolved[f.key];
						const overridden = !!(snap.user && Object.prototype.hasOwnProperty.call(snap.user, f.key)) || (draft && Object.prototype.hasOwnProperty.call(draft, f.key));
						return el("label", { key: f.key, style: { display: "block", margin: "6px 0" } },
							el("div", { style: { marginBottom: 4, opacity: 0.85 } },
								f.label, overridden ? el("span", { style: { marginLeft: 6, fontSize: 11, color: "#e8b34c" } }, "（已覆盖）") : null),
							f.kind === "text"
								? el("input", { style: inputStyle, value: current ?? "", onChange: (e) => stage(f.key, e.target.value) })
								: f.kind === "select"
									? el("div", { style: { display: "flex", gap: 6 } },
										f.options.map((o) => {
											const active = (current ?? f.options[0]) === o;
											return el("button", {
												key: o, type: "button",
												onClick: () => stage(f.key, o),
												style: {
													padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
													border: active ? "1px solid #2f6fed" : "1px solid var(--dsw-alias-border, rgba(127,127,127,.45))",
													background: active ? "#2f6fed" : "transparent",
													color: active ? "#fff" : "inherit"
												}
											}, o);
										}))
									: el("input", { type: "checkbox", checked: !!current, onChange: (e) => stage(f.key, e.target.checked) })
						);
					}),
				el("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
					el("button", { onClick: save, disabled: writable === false,
						style: { background: "#2f6fed", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" } }, "保存"),
					draft ? el("button", { onClick: () => { setDraft(null); setMsg(""); },
						style: { background: "var(--dsw-alias-border, rgba(127,127,127,.35))", color: "inherit", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" } }, "放弃修改") : null,
					msg ? el("span", { style: { alignSelf: "center", fontSize: 12 } }, msg) : null)
			);
		}

		//#region client/index.js — lazy slot registration
		const inject = ["slots", "settingsScope"];

		function safe(slot, fn) {
			try {
				fn();
			} catch (e) {
				console.warn(`[foreman-config] slot "${slot}" registration failed:`, e);
			}
		}

		function apply(ctx) {
			// 懒注册：等 settings-plugins 条目声明 settings.plugin.item 之后再挂卡片，
			// 且任何失败都不许拖垮本条目（照 dsh-bot-mode 的加固模式）。
			safe("settings.plugin.item", () =>
				ctx.slots.inject("settings.plugin.item", () =>
					ctx.slots.register({
						name: "settings.plugin.item",
						id: "foreman-config",
						key: "foreman",
						order: 5
					}, function ForemanCardOwner() {
						return react.createElement(ForemanCard, { scope: ctx.settingsScope.bind({ namespace: "foreman" }) });
					})
				)
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
