"""Validate foreman preset YAML: parse with a !!js-tolerant loader, verify the
scout lane structure + persona clause 6, and simulate the foreman-dsh-config
rewriter binding (must target the delegate lane, never the scout lane)."""
import io
import re

import yaml

PATH = r"C:\Users\admin\.dsh\.agent-presets\foreman\agent.cordis.yml"
t = io.open(PATH, encoding="utf-8").read()


class JsAwareLoader(yaml.SafeLoader):
    pass


def js_constructor(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    return None


JsAwareLoader.add_multi_constructor("tag:yaml.org,2002:js", js_constructor)
doc = yaml.load(t, Loader=JsAwareLoader)
assert isinstance(doc, list), "top level must be a list"
print("rows:", len(doc))


def row(row_id, container=None):
    pool = container if container is not None else doc
    for item in pool:
        if isinstance(item, dict) and item.get("id") == row_id:
            return item
    raise SystemExit(f"missing row: {row_id}")


delegation = row("delegation")
assert delegation.get("group") is True
cfg = delegation["config"]
cfg_ids = [c.get("id") for c in cfg]
for want in ("tool-subagent", "tool-foreman-delegate", "tool-foreman-scout", "tool-subagent-fork"):
    assert want in cfg_ids, f"missing {want} in delegation group"
order = {k: cfg_ids.index(k) for k in ("tool-foreman-delegate", "tool-foreman-scout")}
assert order["tool-foreman-delegate"] < order["tool-foreman-scout"], "scout must come AFTER delegate (rewriter binds first agentOptions)"

# singleton constraint: exactly ONE modelSelectionCapable instance (the scout)
capable = [c["id"] for c in cfg if isinstance(c.get("config"), dict) and c["config"].get("modelSelectionSettings") is True]
assert capable == ["tool-foreman-scout"], f"modelSelectionCapable instances must be exactly [scout], got {capable}"

# worker deny list must contain subagent (safe now: subagent row registers unconditionally)
delegate = row("tool-foreman-delegate", cfg)["config"]
assert "subagent" in delegate["toolFilter"]["deny"], "worker deny list must include subagent"

scout = row("tool-foreman-scout", cfg)["config"]
assert scout["toolName"] == "scout_worker"
assert scout["backgroundMode"] == "one-shot"
assert scout["agentOptions"]["provider"] == "qwen-daily"
assert scout["agentOptions"]["model"] == "qwen3.8-daily"
assert scout["agentOptions"]["reasoningEffort"] == "low"
assert set(scout["toolFilter"]["allow"]) == {"read", "glob", "grep", "read_image"}
assert "deny" not in scout["toolFilter"]
assert "只读工具" in scout["persona"] and "侦查地图" in scout["persona"] and "subagent" not in scout["persona"].replace("不得", "")
print("scout lane ok; persona chars:", len(scout["persona"]))

persona = row("persona")["config"]["text"]
for want in ("scout_worker", "侦察委托", "地图只用于导航", "自读，理由"):
    assert want in persona, f"persona missing: {want}"
print("persona clause 6 ok; chars:", len(persona))

# simulate foreman-dsh-config getYmlBinding (verbatim semantics)
lines = t.split("\n")
binding = None
for i, line in enumerate(lines):
    if re.match(r"^\s*agentOptions:\s*$", line):
        m_p = re.search(r"provider:\s*(\S+)", lines[i + 1] or "")
        m_m = re.search(r"model:\s*(\S+)", lines[i + 2] or "")
        if m_p and m_m:
            binding = (i, m_p.group(1), m_m.group(1))
            break
print("first agentOptions binding: line", binding[0], "->", binding[1], binding[2])
assert (binding[1], binding[2]) == ("qwen-daily", "qwen3.8-daily")
owner = next(lines[j].strip() for j in range(binding[0], -1, -1) if lines[j].lstrip().startswith("- id:"))
print("binding owner:", owner)
assert owner == "- id: tool-foreman-delegate", "rewriter would target the wrong lane!"
print("ALL CHECKS PASSED")
