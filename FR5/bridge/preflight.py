# observe-only 사전검증 — 통과 못 하면 명령 상태로 절대 승격하지 않는다 (D39 · API-CONTRACT §프로필).
# 검사는 "있어야 할 것이 있고, 맞아야 할 것이 맞는가"다. 값을 고쳐주지 않고 사유를 들고 거부한다.

REQUIRED_SAFETY = [
    "emergencyStop", "safetyStop", "collisionDetected",
    "inDragTeach", "mainErrorCode", "subErrorCode",
]
REQUIRED_VERSION = ["controller", "servo", "sdk"]


def check(profile, version, state):
    """반환: 실패 사유 목록. 비어 있으면 통과 → OBSERVE_ONLY."""
    reasons = []
    expected = profile.get("expectedModel")
    if version.get("model") != expected:
        reasons.append(f"모델 불일치 — 기대 {expected}, 응답 {version.get('model')}")
    for f in REQUIRED_VERSION:
        if not version.get(f):
            reasons.append(f"버전 필드 누락 — {f}")
    joints = state.get("jointsDeg")
    if not isinstance(joints, list) or len(joints) != 6:
        reasons.append(f"6축 배열이 아니다 — jointsDeg={joints!r}")
    if "enabled" not in state:
        reasons.append("enabled(서보) 필드 누락 — 안전 게이트를 만들 수 없다")
    safety = state.get("safety") or {}
    for f in REQUIRED_SAFETY:
        if f not in safety:
            reasons.append(f"안전 필드 누락 — safety.{f}")
    return reasons
