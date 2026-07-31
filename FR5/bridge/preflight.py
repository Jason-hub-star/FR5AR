# observe-only 사전검증 — 통과 못 하면 명령 상태로 절대 승격하지 않는다 (D39 · API-CONTRACT §프로필).
# 검사는 "있어야 할 것이 있고, 맞아야 할 것이 맞는가"다. 값을 고쳐주지 않고 사유를 들고 거부한다.

REQUIRED_SAFETY = [
    "emergencyStop", "safetyStop", "collisionDetected",
    "inDragTeach", "mainErrorCode", "subErrorCode",
]


def check(profile, version, state):
    """반환: 실패 사유 목록. 비어 있으면 통과 → OBSERVE_ONLY.

    모델·컨트롤러 문자열은 **어댑터가 보고한 값만** 검증한다 — 실기 C#SDK-V1.2.4 는
    GetSoftwareVersion 이 빈 문자열을 반환한다 (2026-07-31 실측, evidence/fr5-cs-adapter).
    보고했는데 다르면 차단, 미보고면 sdk 문자열·6축·안전 필드로 판정한다.
    관측은 원래 조건 없이 허용이다 (SAFETY-RULES §명령별 최소 조건) — 명령 게이트는 별도다.
    """
    reasons = []
    expected = profile.get("expectedModel")
    reported = version.get("model")
    if reported is not None and reported != expected:
        reasons.append(f"모델 불일치 — 기대 {expected}, 응답 {reported}")
    if not version.get("sdk"):
        reasons.append("버전 필드 누락 — sdk")
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
