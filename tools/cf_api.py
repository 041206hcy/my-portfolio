"""通过 Cloudflare API 直接操作 D1（绕开 wrangler 的不稳定网络）。

用法（在 personal-site 目录下）：
    python tools/cf_api.py            # 验证登录态 + 列出云端表的清单
    python tools/cf_api.py apply      # 把 schema.sql 逐条执行到云端库
    python tools/cf_api.py sql "SELECT * FROM settings"

设计说明：wrangler 走的是 it.fetch + 代理环境变量，用户机器上这条链路经常在
最后一步断掉（上传成功了但轮询失败）。这里直接用 python + 系统代理调官方 API，
用 OAuth token（wrangler 登录留下的）鉴权，作为兜底手段。
"""

import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

TOML = pathlib.Path(r"C:\Users\黄翀与\AppData\Roaming\xdg.config\.wrangler\config\default.toml")
ACCOUNT = "68e2083d23147e05a6f1b6d415483621"
DATABASE = "0540344a-dddc-4190-9547-2fe085ab75fc"
PROXY = "http://127.0.0.1:7897"
API = "https://api.cloudflare.com/client/v4"


def token() -> str:
    txt = TOML.read_text(encoding="utf-8")
    m = re.search(r'oauth_token\s*=\s*"([^"]+)"', txt)
    if not m:
        raise SystemExit("找不到 oauth_token，请先在终端跑 npx wrangler login")
    return m.group(1)


def _opener():
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
    )


def call(method: str, url: str, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token())
    req.add_header("Content-Type", "application/json")
    try:
        with _opener().open(req, timeout=45) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", "replace")
        try:
            return err.code, json.loads(raw)
        except Exception:
            return err.code, {"raw": raw[:300]}
    except Exception as err:  # 网络层错误
        return 0, {"err": type(err).__name__ + ": " + str(err)}


def query(sql: str):
    url = f"{API}/accounts/{ACCOUNT}/d1/database/{DATABASE}/query"
    status, body = call("POST", url, {"sql": sql})
    if status != 200 or not body.get("success"):
        return None, f"HTTP {status} " + json.dumps(body, ensure_ascii=False)[:400]
    item = body["result"][0]
    if not item.get("success", True):
        return None, json.dumps(item, ensure_ascii=False)[:400]
    return item.get("results"), None


def clean(chunk: str) -> str:
    lines = [ln for ln in chunk.splitlines() if not ln.strip().startswith("--")]
    return "\n".join(lines).strip()


def main() -> None:
    status, body = call("GET", f"{API}/user")
    who = (body.get("result") or {}).get("email")
    print(f"登录态: HTTP {status} email={who} errors={body.get('errors')}")

    args = sys.argv[1:]
    if args and args[0] == "sql":
        rows, err = query(" ".join(args[1:]))
        print("ERR " + err if err else json.dumps(rows, ensure_ascii=False, indent=2))
        return

    if args and args[0] == "url":
        target = args[1]
        out = args[2] if len(args) > 2 else None
        last = None
        for attempt in range(1, 4):
            req = urllib.request.Request(target, method="GET")
            req.add_header("User-Agent", "cf-api-probe")
            try:
                with _opener().open(req, timeout=45) as resp:
                    raw = resp.read()
                    print(
                        f"HTTP {resp.status}  {len(raw)}B  "
                        f"ct={resp.headers.get('content-type')}  "
                        f"cache={resp.headers.get('cf-cache-status')}  attempt={attempt}"
                    )
                    if out:
                        pathlib.Path(out).write_bytes(raw)
                        print("saved ->", out)
                    head = raw[:240].decode("utf-8", "replace").encode("ascii", "replace").decode()
                    print("head:", head.replace("\n", " "))
                    return
            except urllib.error.HTTPError as err:
                print(f"HTTP {err.code}  {err.read(300).decode('utf-8', 'replace')}")
                return
            except Exception as err:
                last = f"{type(err).__name__}: {err}"
                print(f"attempt {attempt} failed: {last}")
        print("all attempts failed:", last)
        return

    if args and args[0] == "zone":
        zone = "5a71805b70ab7363f6b5de9196d5e2d3"  # shackle0412.vip
        status, res = call("GET", f"{API}/zones/{zone}")
        z = res.get("result") or {}
        print(
            f"HTTP {status}  {z.get('name')}  status={z.get('status')}  "
            f"activated_on={z.get('activated_on')}  reason={z.get('activation_failure_reason')}"
        )
        print("  期望 NS:", ", ".join(z.get("name_servers") or []))
        print("  实际 NS:", ", ".join(z.get("observed_name_servers") or []))
        return

    if args and args[0] == "domain":
        # 绑定 Worker 自定义域名。JSON 在 python 里构造，避开 PowerShell 传参吃引号的坑。
        host = args[1]
        body = {
            "environment": "production",
            "hostname": host,
            "service": "myfirst",
            "zone_id": "5a71805b70ab7363f6b5de9196d5e2d3",
        }
        status, res = call("POST", f"{API}/accounts/{ACCOUNT}/workers/domains", body)
        print(f"HTTP {status}  {host}  success={res.get('success')}  errors={res.get('errors')}")
        r = res.get("result") or {}
        if r:
            print("  cert_id:", r.get("cert_id"), " enabled:", r.get("enabled"))
        return

    if args and args[0] == "domains":
        status, res = call("GET", f"{API}/accounts/{ACCOUNT}/workers/domains")
        for d in res.get("result") or []:
            print(
                f"  {str(d.get('hostname')):<26} -> {d.get('service'):<18} "
                f"zone={d.get('zone_name'):<16} enabled={d.get('enabled')} cert={bool(d.get('cert_id'))}"
            )
        print(f"HTTP {status}")
        return

    if args and args[0] == "raw":
        method = args[1]
        path = args[2]
        payload = json.loads(args[3]) if len(args) > 3 else None
        status, res = call(method, API + path, payload)
        print(f"HTTP {status}")
        print(json.dumps(res, ensure_ascii=False, indent=2)[:2500])
        return

    if args and args[0] == "apply":
        sql = pathlib.Path("schema.sql").read_text(encoding="utf-8")
        stmts = [clean(s) for s in sql.split(";")]
        stmts = [s for s in stmts if s]
        print(f"共 {len(stmts)} 条语句")
        for i, stmt in enumerate(stmts, 1):
            rows, err = query(stmt)
            head = stmt.splitlines()[0][:58]
            print(f"[{i}/{len(stmts)}] {head:<60} {'ERR ' + err if err else 'ok'}")

    rows, err = query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    if err:
        print("查表失败: " + err)
        return
    names = [r.get("name") for r in rows]
    print(f"云端已有 {len(names)} 张表/索引: {names}")


if __name__ == "__main__":
    main()