from fastapi.testclient import TestClient

from app.main import app
from app.services.rooms import room_store


def setup_function() -> None:
    room_store.reset()


def test_healthcheck() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_room_creation_and_join() -> None:
    client = TestClient(app)

    create_response = client.post("/api/rooms", json={"nickname": "Host", "max_players": 6})
    room = create_response.json()

    join_response = client.post(
        "/api/rooms/join",
        json={"code": room["code"], "nickname": "Guest"},
    )

    assert create_response.status_code == 201
    assert join_response.status_code == 200
    assert len(join_response.json()["players"]) == 2


def test_player_can_fetch_latest_room_state() -> None:
    client = TestClient(app)

    create_response = client.post("/api/rooms", json={"nickname": "Host", "max_players": 6})
    room = create_response.json()

    response = client.get(
        f"/api/rooms/{room['room_id']}",
        params={"player_id": room["session_player_id"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["room_id"] == room["room_id"]
    assert payload["session_player_id"] == room["session_player_id"]


def test_all_players_ready_enters_preview_phase() -> None:
    client = TestClient(app)

    create_response = client.post("/api/rooms", json={"nickname": "Host", "max_players": 4})
    room = create_response.json()

    join_response = client.post(
        "/api/rooms/join",
        json={"code": room["code"], "nickname": "Guest"},
    )
    guest_room = join_response.json()

    client.post(
        f"/api/rooms/{room['room_id']}/ready",
        json={"player_id": room["session_player_id"], "ready": True},
    )
    ready_response = client.post(
        f"/api/rooms/{room['room_id']}/ready",
        json={"player_id": guest_room["session_player_id"], "ready": True},
    )

    assert ready_response.status_code == 200
    payload = ready_response.json()
    assert payload["status"] == "peeking"
    assert payload["game"]["stage"] == "preview"
    assert payload["game"]["players"][1]["visible_card_count"] == 2


def test_opening_ready_hides_peeked_cards_and_starts_game() -> None:
    client = TestClient(app)

    create_response = client.post("/api/rooms", json={"nickname": "Host", "max_players": 4})
    room = create_response.json()

    join_response = client.post(
        "/api/rooms/join",
        json={"code": room["code"], "nickname": "Guest"},
    )
    guest_room = join_response.json()

    client.post(
        f"/api/rooms/{room['room_id']}/ready",
        json={"player_id": room["session_player_id"], "ready": True},
    )
    client.post(
        f"/api/rooms/{room['room_id']}/ready",
        json={"player_id": guest_room["session_player_id"], "ready": True},
    )

    host_preview = client.post(
        f"/api/rooms/{room['room_id']}/opening-ready",
        json={"player_id": room["session_player_id"]},
    )
    guest_preview = client.post(
        f"/api/rooms/{room['room_id']}/opening-ready",
        json={"player_id": guest_room["session_player_id"]},
    )

    assert host_preview.status_code == 200
    assert guest_preview.status_code == 200
    payload = guest_preview.json()
    assert payload["status"] == "in_game"
    assert payload["game"]["stage"] == "active"
    assert payload["game"]["draw_pile_count"] == 44
    assert payload["game"]["players"][0]["visible_card_count"] == 0
    assert payload["game"]["players"][1]["visible_card_count"] == 0


def test_finished_game_reveals_all_cards_to_every_player() -> None:
    client = TestClient(app)

    create_response = client.post("/api/rooms", json={"nickname": "Host", "max_players": 4})
    room = create_response.json()

    join_response = client.post(
        "/api/rooms/join",
        json={"code": room["code"], "nickname": "Guest"},
    )
    guest_room = join_response.json()

    client.post(
        f"/api/rooms/{room['room_id']}/ready",
        json={"player_id": room["session_player_id"], "ready": True},
    )
    client.post(
        f"/api/rooms/{room['room_id']}/ready",
        json={"player_id": guest_room["session_player_id"], "ready": True},
    )

    fetched_room = client.get(
        f"/api/rooms/{room['room_id']}",
        params={"player_id": room["session_player_id"]},
    ).json()
    room_store.get_room(room["room_id"], room["session_player_id"]).game_setup.stage = "finished"
    room_store.get_room(room["room_id"], room["session_player_id"]).game_setup.winner_player_ids = [room["session_player_id"]]

    finished_response = client.get(
        f"/api/rooms/{room['room_id']}",
        params={"player_id": room["session_player_id"]},
    )

    assert finished_response.status_code == 200
    payload = finished_response.json()
    assert payload["game"]["stage"] == "finished"
    assert payload["game"]["players"][0]["visible_card_count"] == 4
    assert payload["game"]["players"][1]["visible_card_count"] == 4
    assert all(card["code"] is not None for player in payload["game"]["players"] for card in player["cards"])
