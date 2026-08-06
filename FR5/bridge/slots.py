# 프로그램 슬롯 — 지점을 순서로 엮어 승인한 것만 실행한다 (PROGRAM-CONTRACT.md 가 정본).
#
# **이 모듈은 로봇을 모른다.** 저장과 판정만 하고, 실제 이동은 라우트가 `goto` 와 **같은 함수**로
# 보낸다 — 실기 cmd 허용목록에 새 이름을 더하지 않는다 (계약 §이 계약이 지키는 것).
# teach.py 와 같은 모양이다 — 도메인은 클래스, 라우트는 얇게 (D54). main 을 모른다.
#
# **슬롯은 좌표를 안 든다** (D78) — `pointName` 만 참조한다. 관절값을 굳혀 넣으면 지점을 다시
# 가르쳤을 때 슬롯이 옛 자세로 가고, 같은 값이 두 파일에 살아 단위 변환 지점이 둘이 된다.
import json
import time
from pathlib import Path

from teach import safe_name

MAX_STEPS = 50          # 계약 §POST /slots — 선형 목록의 상한
STEP_TYPES = ("move",)  # 천장: grip·wait 는 move 로 한 바퀴 돈 뒤에 연다
# 승인 당시와 지금이 같아야 하는 것. 그리퍼 장착 전(tool0)에 승인한 것을 장착 후에 실행하면
# TCP 오프셋만큼 어긋나 **파지 실패가 아니라 충돌**이 된다 (계약 §step 2번)
IDENTITY_KEYS = ("robotId", "toolId", "userId")


class SlotStore:
    """슬롯 하나가 파일 하나. 이름은 파일 이름이 되므로 `safe_name` 을 지난다 (감사 P0-2)."""

    def __init__(self, data_dir):
        self._dir = Path(data_dir) / "slots"

    def _path(self, name):
        """이름 → 파일 경로. **폴더 밖으로 나가면 None** — 호출처가 검사를 빠뜨려도 막는다."""
        ok, _ = safe_name(name)
        if not ok:
            return None
        path = (self._dir / f"{ok}.json").resolve()
        return path if path.parent == self._dir.resolve() else None

    def list(self):
        out = []
        for f in sorted(self._dir.glob("*.json")) if self._dir.exists() else []:
            try:
                out.append(json.loads(f.read_text()))
            except json.JSONDecodeError:
                continue
        return out

    def get(self, name):
        path = self._path(name)
        if path is None:
            return None
        try:
            return json.loads(path.read_text())
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return None

    def _write(self, slot):
        self._dir.mkdir(parents=True, exist_ok=True)
        path = self._path(slot["name"])
        if path is None:            # 여기까지 왔으면 호출처가 검사를 빠뜨린 것이다
            raise ValueError(f"슬롯 이름을 파일로 쓸 수 없다 — {slot['name']!r}")
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(slot, ensure_ascii=False, indent=1))
        tmp.replace(path)
        return slot

    def save(self, name, steps, known_points):
        """만들거나 덮어쓴다. **항상 `draft` 로 돌아간다** (계약 §POST /slots).

        승인은 그 순간의 단계 목록에 대한 것이라, 목록이 바뀌면 그 승인은 다른 프로그램의
        승인이다. 리비전이 없는 지금은 이게 그 자리를 대신한다.
        """
        name, reasons = safe_name(name)
        if reasons:
            return None, reasons
        if not isinstance(steps, list) or not steps:
            return None, ["단계가 없다 — 빈 프로그램은 승인할 수 없다"]
        if len(steps) > MAX_STEPS:
            return None, [f"단계가 너무 많다 — {len(steps)} (상한 {MAX_STEPS})"]
        clean = []
        for i, s in enumerate(steps, 1):
            if not isinstance(s, dict) or s.get("type") not in STEP_TYPES:
                return None, [f"{i}번째 단계의 type 이 {STEP_TYPES} 가 아니다 — {s!r}"]
            pn = s.get("pointName")
            # **없는 지점을 가리키면 저장 자체를 거부한다** — 실행 시점에야 드러나면
            # 사람이 로봇 앞에 선 다음에 알게 된다 (계약 §POST /slots)
            if pn not in known_points:
                return None, [f"{i}번째 단계가 없는 지점을 가리킨다 — {pn!r}"]
            clean.append({"type": "move", "pointName": pn})
        return self._write({
            "name": name, "steps": clean, "status": "draft",
            "approvedAt": None, "approvedBy": None, "approvedWith": None,
            "updatedAt": time.time(),
        }), []

    def delete(self, name):
        path = self._path(name)
        if path is None or not path.exists():
            return False
        path.unlink()
        return True

    def approve(self, name, who, identity):
        """조종권 + 현장확인을 지난 뒤 불린다. **로봇을 움직이지 않는다.**

        승인 시점의 정체를 박아 둔다 — 실행 직전에 이걸 지금과 대조한다. 고정만 하고 안 보면
        옛 승인이 바뀐 실기에 나간다 (골 Outcome 4).
        """
        slot = self.get(name)
        if slot is None:
            return None, [f"없는 슬롯 — {name}"]
        slot["status"] = "approved"
        slot["approvedAt"] = time.time()
        slot["approvedBy"] = who
        slot["approvedWith"] = {k: identity.get(k) for k in IDENTITY_KEYS}
        slot["approvedWith"]["firmware"] = identity.get("firmware")
        return self._write(slot), []

    def step_target(self, name, index, identity):
        """`index` 단계가 갈 지점 이름. 반환: `(pointName, 사유목록)`.

        **로봇에 아무것도 안 보낸다** — 라우트가 이 이름을 `goto` 와 같은 경로로 보낸다.
        """
        slot = self.get(name)
        if slot is None:
            return None, [f"없는 슬롯 — {name}"]
        if slot.get("status") != "approved":
            return None, [f"승인되지 않은 슬롯이다 — status={slot.get('status')}. 먼저 승인한다"]
        reasons = identity_mismatch(slot.get("approvedWith"), identity)
        if reasons:
            return None, reasons
        steps = slot.get("steps") or []
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(steps):
            return None, [f"단계 번호가 범위 밖이다 — {index} (0~{len(steps) - 1})"]
        return steps[index]["pointName"], []

    def refs_to_point(self, point_name):
        """이 지점을 참조하는 슬롯 이름들. 비어 있으면 지점을 지워도 된다 (계약 §지점 삭제)."""
        return [s["name"] for s in self.list()
                if any(st.get("pointName") == point_name for st in (s.get("steps") or []))]


def identity_mismatch(approved_with, now):
    """승인 당시 정체와 지금이 다른가. 반환: 사유 목록, 비면 같다.

    **기록이 없으면 통과가 아니라 차단이다** (제1원칙) — 승인 경로를 안 지난 슬롯이다.
    """
    if not isinstance(approved_with, dict):
        return ["승인 당시 정체 기록이 없다 — 다시 승인한다 (제1원칙: 결측=차단)"]
    out = []
    for k in IDENTITY_KEYS:
        want, got = approved_with.get(k), (now or {}).get(k)
        if want != got:
            out.append(f"승인 당시와 다르다 — {k} 승인 {want!r} · 지금 {got!r}")
    return out
