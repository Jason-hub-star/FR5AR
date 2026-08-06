# slots.py 단위 테스트 — 순수 파일 I/O 라 로봇 없이 전부 돈다 (PROGRAM-CONTRACT.md 가 정본).
#
# 여기서 지키는 것 넷:
#   **없는 지점을 가리키면 저장에서 막는다**(실행 시점에 알면 사람이 로봇 앞에 선 다음이다) ·
#   **고치면 승인이 풀린다** · **승인 안 된 것은 실행 못 한다** ·
#   **승인 당시 정체와 지금이 다르면 실행 못 한다**(tool0 승인 → 장착 후 실행 = 충돌).
import tempfile
import unittest
from pathlib import Path

from slots import MAX_STEPS, SlotStore, identity_mismatch

IDENT = {"robotId": "fr5-lab-a", "toolId": 1, "userId": 1, "firmware": "V3.9.33-QX"}
POINTS = {"home", "1", "2"}


def steps(*names):
    return [{"type": "move", "pointName": n} for n in names]


class Save(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SlotStore(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_저장하면_draft_다(self):
        slot, reasons = self.store.save("집기시연", steps("home", "1"), POINTS)
        self.assertEqual(reasons, [])
        self.assertEqual(slot["status"], "draft")
        self.assertEqual([s["pointName"] for s in slot["steps"]], ["home", "1"])
        self.assertIsNone(slot["approvedWith"])

    def test_좌표를_안_든다(self):
        """슬롯은 `pointName` 만 참조한다 (D78) — 관절값이 들어가면 정본이 둘이 된다."""
        slot, _ = self.store.save("s", steps("home"), POINTS)
        self.assertEqual(set(slot["steps"][0]), {"type", "pointName"})

    def test_없는_지점을_가리키면_저장이_거부된다(self):
        _, reasons = self.store.save("s", steps("home", "없음"), POINTS)
        self.assertTrue(any("없는 지점" in r for r in reasons))
        self.assertIsNone(self.store.get("s"))

    def test_빈_단계는_거부(self):
        for bad in ([], None, "home"):
            with self.subTest(steps=bad):
                _, reasons = self.store.save("s", bad, POINTS)
                self.assertTrue(reasons)

    def test_단계_상한(self):
        _, reasons = self.store.save("s", steps(*["home"] * (MAX_STEPS + 1)), POINTS)
        self.assertTrue(any("너무 많다" in r for r in reasons))

    def test_move_아닌_type_은_거부(self):
        _, reasons = self.store.save("s", [{"type": "grip", "pointName": "home"}], POINTS)
        self.assertTrue(any("type" in r for r in reasons))

    def test_경로가_되는_이름은_거부(self):
        for bad in ("/etc/cron.d/pwn", "../../x", "a/b", ""):
            with self.subTest(name=bad):
                _, reasons = self.store.save(bad, steps("home"), POINTS)
                self.assertTrue(reasons)

    def test_고치면_승인이_풀린다(self):
        self.store.save("s", steps("home"), POINTS)
        self.store.approve("s", "kim", IDENT)
        self.assertEqual(self.store.get("s")["status"], "approved")
        self.store.save("s", steps("home", "1"), POINTS)     # 목록을 바꿨다
        self.assertEqual(self.store.get("s")["status"], "draft")
        self.assertIsNone(self.store.get("s")["approvedWith"])


class StepGate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SlotStore(self.tmp.name)
        self.store.save("s", steps("home", "1", "2"), POINTS)

    def tearDown(self):
        self.tmp.cleanup()

    def test_승인_전에는_실행_못_한다(self):
        target, reasons = self.store.step_target("s", 0, IDENT)
        self.assertIsNone(target)
        self.assertTrue(any("승인" in r for r in reasons))

    def test_승인하면_단계_이름이_나온다(self):
        self.store.approve("s", "kim", IDENT)
        for i, want in enumerate(["home", "1", "2"]):
            with self.subTest(index=i):
                self.assertEqual(self.store.step_target("s", i, IDENT), (want, []))

    def test_범위_밖_번호는_거부(self):
        self.store.approve("s", "kim", IDENT)
        for bad in (-1, 3, 99, None, "0", 1.5, True):
            with self.subTest(index=bad):
                target, reasons = self.store.step_target("s", bad, IDENT)
                self.assertIsNone(target, f"{bad!r} 가 통과했다")
                self.assertTrue(reasons)

    def test_좌표계가_바뀌면_실행_못_한다(self):
        """tool0 에서 승인한 것을 그리퍼 장착 후 실행하면 파지 실패가 아니라 충돌이다."""
        self.store.approve("s", "kim", IDENT)
        target, reasons = self.store.step_target("s", 0, {**IDENT, "toolId": 0})
        self.assertIsNone(target)
        self.assertTrue(any("toolId" in r for r in reasons))

    def test_다른_개체면_실행_못_한다(self):
        self.store.approve("s", "kim", IDENT)
        target, _ = self.store.step_target("s", 0, {**IDENT, "robotId": "fr5-lab-b"})
        self.assertIsNone(target)

    def test_펌웨어는_대조하지_않는다(self):
        """기록은 남기되 판정에는 안 쓴다 — 펌웨어가 오르면 모든 승인이 죽는다."""
        self.store.approve("s", "kim", IDENT)
        self.assertEqual(self.store.step_target("s", 0, {**IDENT, "firmware": "V9"}), ("home", []))

    def test_없는_슬롯은_404_사유(self):
        target, reasons = self.store.step_target("없음", 0, IDENT)
        self.assertIsNone(target)
        self.assertTrue(reasons)


class IdentityGate(unittest.TestCase):
    def test_기록이_없으면_차단이다(self):
        for bad in (None, {}, "x", []):
            with self.subTest(approved=bad):
                self.assertTrue(identity_mismatch(bad, IDENT))

    def test_같으면_통과(self):
        self.assertEqual(identity_mismatch(dict(IDENT), IDENT), [])


class PointRefs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SlotStore(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_참조하는_슬롯을_찾는다(self):
        self.store.save("a", steps("home", "1"), POINTS)
        self.store.save("b", steps("2"), POINTS)
        self.assertEqual(self.store.refs_to_point("home"), ["a"])
        self.assertEqual(sorted(self.store.refs_to_point("2")), ["b"])
        self.assertEqual(self.store.refs_to_point("없음"), [])

    def test_빈_폴더도_목록이_돈다(self):
        self.assertEqual(self.store.list(), [])
        self.assertEqual(self.store.refs_to_point("home"), [])

    def test_삭제(self):
        self.store.save("a", steps("home"), POINTS)
        self.assertTrue(self.store.delete("a"))
        self.assertFalse(self.store.delete("a"))
        self.assertIsNone(self.store.get("a"))


if __name__ == "__main__":
    unittest.main()
