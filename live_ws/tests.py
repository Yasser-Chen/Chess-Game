from django.test import SimpleTestCase

from .consumers import LiveWebSocketsConsumer


class OnlineMoveValidationTests(SimpleTestCase):
    def test_accepts_board_coordinates_for_a_real_move(self):
        self.assertTrue(LiveWebSocketsConsumer._is_valid_move_event({
            "x": 7, "y": 5, "newX": 5, "newY": 5,
        }))

    def test_rejects_malformed_out_of_range_and_null_moves(self):
        invalid_events = [
            {"x": 7, "y": 5, "newX": 7, "newY": 5},
            {"x": 9, "y": 5, "newX": 8, "newY": 5},
            {"x": "7", "y": 5, "newX": 6, "newY": 5},
            {"x": True, "y": 5, "newX": 6, "newY": 5},
        ]
        for event in invalid_events:
            with self.subTest(event=event):
                self.assertFalse(LiveWebSocketsConsumer._is_valid_move_event(event))

# Create your tests here.
