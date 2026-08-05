# `_guard` 단위 테스트 — xmlrpc 상한과 **상한이 만든 오염**을 사람 말로 바꾸는 부분.
#
# 실기에서 이걸로 한 번 죽었다 (2026-08-05): 33° 이동이 블로킹 `MoveJ` 로 3초를 넘겨
# 스레드가 버려졌고, 버려진 스레드가 연결을 쥔 채라 이후 전부 `Request-sent` 였다.
# 화면에는 "상태 읽기 실패 — Request-sent" 만 떠서 네트워크 문제로 오인하기 딱 좋았다.
import http.client
import time
import unittest

from robot_adapter.fairino import CMD_TIMEOUT_S, _guard


class Guard(unittest.TestCase):
    def test_정상값은_그대로_돌려준다(self):
        self.assertEqual(_guard(lambda: 42), 42)
        self.assertEqual(_guard(lambda a, b=0: a + b, 1, b=2), 3)

    def test_상한을_넘으면_사람이_읽는_사유로_던진다(self):
        t0 = time.time()
        with self.assertRaises(ConnectionError) as cm:
            _guard(lambda: time.sleep(CMD_TIMEOUT_S + 2))
        self.assertIn("응답 없음", str(cm.exception))
        # 상한만큼만 기다리고 호출자를 풀어 준다 — 브리지 전체가 서면 stop 도 못 나간다
        self.assertLess(time.time() - t0, CMD_TIMEOUT_S + 1.5)

    def test_오염된_연결은_Request_sent_가_아니라_재연결하라고_말한다(self):
        def poisoned():
            raise http.client.CannotSendRequest("Request-sent")
        with self.assertRaises(ConnectionError) as cm:
            _guard(poisoned)
        msg = str(cm.exception)
        self.assertIn("연결이 오염됐다", msg)
        self.assertIn("재연결", msg)
        self.assertIn("CannotSendRequest", msg)     # 원인도 남긴다 — 진단이 사라지면 안 된다

    def test_ResponseNotReady_도_같은_취급(self):
        def poisoned():
            raise http.client.ResponseNotReady()
        with self.assertRaises(ConnectionError) as cm:
            _guard(poisoned)
        self.assertIn("연결이 오염됐다", str(cm.exception))

    def test_다른_예외는_그대로_올린다(self):
        # 삼키면 진짜 원인이 사라진다 — 오염 변환은 두 이름에만 건다
        def boom():
            raise ValueError("진짜 원인")
        with self.assertRaises(ValueError):
            _guard(boom)


if __name__ == "__main__":
    unittest.main()
