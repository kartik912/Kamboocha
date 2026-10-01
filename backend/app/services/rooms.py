from dataclasses import dataclass, field
from datetime import UTC, datetime
from random import SystemRandom
from string import ascii_uppercase, digits

from app.domain.engine import begin_power_action, confirm_preview_ready, deal_opening_layout, discard_pending_card, draw_turn_card, execute_power_action, finalize_turn, react_to_latest_discard, swap_pending_card, sync_timers
from app.domain.models import GameSetup


@dataclass(slots=True)
class RoomPlayer:
    player_id: str
    nickname: str
    seat_index: int
    ready: bool
    joined_at: datetime


@dataclass(slots=True)
class Room:
    room_id: str
    code: str
    host_id: str
    status: str
    min_players: int
    max_players: int
    created_at: datetime
    players: list[RoomPlayer] = field(default_factory=list)
    game_setup: GameSetup | None = None


class RoomStore:
    def __init__(self) -> None:
        self._rooms_by_id: dict[str, Room] = {}
        self._rooms_by_code: dict[str, Room] = {}
        self._random = SystemRandom()

    def create_room(self, host_id: str, nickname: str, max_players: int, created_at: datetime) -> Room:
        code = self._generate_code()
        room = Room(
            room_id=f"room_{code.lower()}",
            code=code,
            host_id=host_id,
            status="waiting",
            min_players=2,
            max_players=max_players,
            created_at=created_at,
            players=[
                RoomPlayer(
                    player_id=host_id,
                    nickname=nickname,
                    seat_index=0,
                    ready=False,
                    joined_at=created_at,
                )
            ],
        )
        self._rooms_by_id[room.room_id] = room
        self._rooms_by_code[room.code] = room
        return room

    def join_room(self, code: str, player_id: str, nickname: str, joined_at: datetime) -> Room:
        room = self._rooms_by_code.get(code)
        if room is None:
            raise ValueError("Room code was not found.")
        if room.status != "waiting":
            raise ValueError("This room is no longer accepting players.")
        if len(room.players) >= room.max_players:
            raise ValueError("This room is already full.")
        if any(player.nickname.casefold() == nickname.casefold() for player in room.players):
            raise ValueError("Nickname is already in use for this room.")

        room.players.append(
            RoomPlayer(
                player_id=player_id,
                nickname=nickname,
                seat_index=len(room.players),
                ready=False,
                joined_at=joined_at,
            )
        )
        return room

    def set_ready(self, room_id: str, player_id: str, ready: bool) -> Room:
        room = self._rooms_by_id.get(room_id)
        if room is None:
            raise KeyError("Room not found.")
        if room.game_setup is not None:
            raise ValueError("Lobby ready cannot change after the opening deal begins.")

        player = next((item for item in room.players if item.player_id == player_id), None)
        if player is None:
            raise KeyError("Player not found in room.")

        player.ready = ready
        if len(room.players) >= room.min_players and all(item.ready for item in room.players):
            room.game_setup = deal_opening_layout(
                room_id=room.room_id,
                player_ids=[item.player_id for item in room.players],
                nicknames=[item.nickname for item in room.players],
            )
            room.status = "peeking"
        elif room.status in {"ready", "peeking"}:
            room.status = "waiting"
        return room

    def get_room(self, room_id: str, player_id: str) -> Room:
        room = self._rooms_by_id.get(room_id)
        if room is None:
            raise KeyError("Room not found.")
        if not any(player.player_id == player_id for player in room.players):
            raise KeyError("Player not found in room.")
        if room.game_setup is not None:
            sync_timers(room.game_setup)
        return room

    def confirm_opening_ready(self, room_id: str, player_id: str) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Opening preview has not started yet.")
        confirm_preview_ready(room.game_setup, player_id=player_id)
        if room.game_setup.stage.value == "active":
            room.status = "in_game"
        return room

    def start_game(self, room_id: str, host_id: str) -> Room:
        room = self._rooms_by_id.get(room_id)
        if room is None:
            raise KeyError("Room not found.")
        if room.host_id != host_id:
            raise ValueError("Only the host can start the game.")
        if room.game_setup is None:
            raise ValueError("All players must be ready before the game can start.")
        room.status = "peeking" if room.game_setup.stage.value == "preview" else "in_game"
        return room

    def draw_card(self, room_id: str, player_id: str) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Game has not started yet.")
        draw_turn_card(room.game_setup, player_id=player_id)
        return room

    def discard_drawn_card(self, room_id: str, player_id: str) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Game has not started yet.")
        discard_pending_card(room.game_setup, player_id=player_id)
        return room

    def start_power_action(self, room_id: str, player_id: str) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Game has not started yet.")
        begin_power_action(room.game_setup, player_id=player_id)
        return room

    def resolve_power_action(
        self,
        room_id: str,
        player_id: str,
        self_position: int | None,
        target_player_id: str | None,
        target_position: int | None,
    ) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Game has not started yet.")
        execute_power_action(
            room.game_setup,
            player_id=player_id,
            self_position=self_position,
            target_player_id=target_player_id,
            target_position=target_position,
        )
        return room

    def swap_drawn_card(self, room_id: str, player_id: str, position: int) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Game has not started yet.")
        swap_pending_card(room.game_setup, player_id=player_id, position=position)
        return room

    def react_to_discard(self, room_id: str, player_id: str, position: int) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Game has not started yet.")
        react_to_latest_discard(room.game_setup, player_id=player_id, position=position)
        return room

    def finalize_turn(self, room_id: str, player_id: str, call_kamboocha: bool) -> Room:
        room = self.get_room(room_id=room_id, player_id=player_id)
        if room.game_setup is None:
            raise ValueError("Game has not started yet.")
        finalize_turn(room.game_setup, player_id=player_id, call_kamboocha=call_kamboocha)
        if room.game_setup.stage.value == "finished":
            room.status = "finished"
        return room

    def reset(self) -> None:
        self._rooms_by_id.clear()
        self._rooms_by_code.clear()

    def _generate_code(self) -> str:
        alphabet = ascii_uppercase + digits
        while True:
            code = "".join(self._random.choice(alphabet) for _ in range(6))
            if code not in self._rooms_by_code:
                return code


room_store = RoomStore()
