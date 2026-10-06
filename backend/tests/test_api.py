from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.domain.models import SwapEvent
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


def test_swap_event_is_shared_public_metadata_and_expires_without_exposing_cards() -> None:
    client = TestClient(app)

    create_response = client.post("/api/rooms", json={"nickname": "Host", "max_players": 4})
    host_room = create_response.json()
    guest_room = client.post(
        "/api/rooms/join",
        json={"code": host_room["code"], "nickname": "Guest"},
    ).json()
    room_id = host_room["room_id"]
    host_id = host_room["session_player_id"]
    guest_id = guest_room["session_player_id"]

    for player_id in (host_id, guest_id):
        client.post(f"/api/rooms/{room_id}/ready", json={"player_id": player_id, "ready": True})
    for player_id in (host_id, guest_id):
        client.post(f"/api/rooms/{room_id}/opening-ready", json={"player_id": player_id})

    game = room_store.get_room(room_id, host_id).game_setup
    assert game is not None
    game.players[0].cards[1].known_to_player = True
    draw_response = client.post(f"/api/rooms/{room_id}/draw", json={"player_id": host_id})
    assert draw_response.status_code == 200
    swap_response = client.post(
        f"/api/rooms/{room_id}/swap",
        json={"player_id": host_id, "position": 2},
    )
    assert swap_response.status_code == 200

    host_payload = swap_response.json()
    guest_payload = client.get(f"/api/rooms/{room_id}", params={"player_id": guest_id}).json()
    host_event = host_payload["game"]["swap_event"]
    guest_event = guest_payload["game"]["swap_event"]

    assert host_event == guest_event
    assert host_event["kind"] == "drawn"
    assert host_event["actor_player_id"] == host_id
    assert host_event["actor_nickname"] == "Host"
    assert host_event["actor_position"] == 2
    assert host_event["target_player_id"] is None
    assert host_event["target_position"] is None
    assert set(host_event) == {
        "event_id",
        "kind",
        "actor_player_id",
        "actor_nickname",
        "actor_position",
        "target_player_id",
        "target_nickname",
        "target_position",
        "created_at",
    }
    host_players = {player["player_id"]: player for player in host_payload["game"]["players"]}
    guest_players = {player["player_id"]: player for player in guest_payload["game"]["players"]}
    assert host_players[host_id]["cards"][1]["code"] is not None
    assert host_players[host_id]["cards"][2]["code"] is None
    assert guest_players[host_id]["cards"][1]["code"] is None
    assert all(card["code"] is None for player in guest_players.values() for card in player["cards"])
    assert host_payload["game"]["reaction_window"]["seconds_remaining"] >= 7

    game.swap_event = SwapEvent(
        kind="player",
        actor_player_id=host_id,
        actor_position=0,
        target_player_id=guest_id,
        target_position=3,
    )
    host_player_swap = client.get(f"/api/rooms/{room_id}", params={"player_id": host_id}).json()["game"]["swap_event"]
    guest_player_swap = client.get(f"/api/rooms/{room_id}", params={"player_id": guest_id}).json()["game"]["swap_event"]
    assert host_player_swap == guest_player_swap
    assert host_player_swap["actor_nickname"] == "Host"
    assert host_player_swap["actor_position"] == 0
    assert host_player_swap["target_nickname"] == "Guest"
    assert host_player_swap["target_position"] == 3

    game.swap_event.created_at -= timedelta(seconds=9)
    stale_payload = client.get(f"/api/rooms/{room_id}", params={"player_id": host_id}).json()
    assert stale_payload["game"]["swap_event"] is None


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
