"""生成管理口令，并把它的 SHA-256 写进 wrangler.jsonc 的 vars。

口令本身不写进任何文件（除了你自己的密码管理器/浏览器），只打印到终端。
"""

import hashlib
import pathlib
import re
import secrets
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = ROOT / "wrangler.jsonc"


def main() -> int:
    token = "ps-" + secrets.token_hex(16)
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()

    text = CFG.read_text(encoding="utf-8")
    pattern = re.compile(r'"vars"\s*:\s*\{[^}]*\}')
    new_vars = (
        '"vars": {\n'
        '    // 管理接口的锁：口令的 SHA-256。明文口令只在你浏览器里，仓库里放哈希是安全的。\n'
        '    "REQUIRE_ACCESS": "0",\n'
        f'    "ADMIN_TOKEN_SHA256": "{digest}"\n'
        '  }'
    )
    text2, n = pattern.subn(new_vars, text, count=1)
    if n != 1:
        print("FAIL 没找到 vars 块，请手工添加")
        return 1
    CFG.write_text(text2, encoding="utf-8", newline="\n")

    print("=" * 58)
    print("管理口令（只显示这一次，请存到密码管理器）：")
    print(token)
    print("=" * 58)
    print("已写入 wrangler.jsonc: ADMIN_TOKEN_SHA256 =", digest)
    return 0


if __name__ == "__main__":
    sys.exit(main())