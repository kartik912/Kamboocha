from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.domain.models import GameStage, PowerAction, TurnPhase
from app.services.rooms import room_store

router = APIRouter(prefix="/rooms", tags=["rooms"])


class CreateRoomRequest(BaseModel):
    nickname: str = Field(min_length=2, max_length=24)
    max_players: int = Field(default=10, ge=2, le=10)


class JoinRoomRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)
    nickname: str = Field(min_length=2, max_length=24)


class ReadyRequest(BaseModel):
    player_id: str
    ready: bool


class StartGameRequest(BaseModel):
    player_id: str


class TurnActionRequest(BaseModel):
    player_id: str


class SwapCardRequest(BaseModel):
    player_id: str
    position: int = Field(ge=0)


class OpeningReadyRequest(BaseModel):
    player_id: str


class PowerResolveRequest(BaseModel):
    player_id: str
    self_position: int | None = Field(default=None, ge=0)
    target_player_id: str | None = None
    target_position: int | None = Field(default=None, ge=0)


class FinalizeTurnRequest(BaseModel):
    player_id: str
    call_kamboocha: bool = False


class PlayerSummary(BaseModel):
    player_id: str
    nickname: str
    seat_index: int
    ready: bool
    joined_at: datetime


class CardSummary(BaseModel):
    position: int
    has_card: bool
    code: str | None
    known_to_player: bool


class GamePlayerSummary(BaseModel):
    player_id: str
    nickname: str
    seat_index: int
    cards: list[CardSummary]
    visible_card_count: int
    total_card_count: int
    penalty_cards: int
    preview_ready: bool


class ReactionSummary(BaseModel):
    latest_discard_code: str
    seconds_remaining: int


class PowerSummary(BaseModel):
    action: PowerAction
    actor_player_id: str
    awaiting_ready: bool
    revealed_self_code: str | None
    revealed_target_code: str | None
    selected_target_player_id: str | None


class GameSummary(BaseModel):
    stage: GameStage
    current_player_id: str
    draw_pile_count: int
    discard_pile_count: int
    reshuffle_count: int
    turn_phase: TurnPhase
    pending_drawn_card_code: str | None
    discard_pile_codes: list[str]
    reaction_window: ReactionSummary | None
    power_state: PowerSummary | None
    kamboocha_caller_id: str | None
    final_round_remaining_player_ids: list[str]
    winner_player_ids: list[str]
    players: list[GamePlayerSummary]


class RoomSummary(BaseModel):
    session_player_id: str
    room_id: str
    code: str
    host_id: str
    status: str
    min_players: int
    max_players: int
    created_at: datetime
    players: list[PlayerSummary]
    game: GameSummary | None = None


def _room_response(room, session_player_id: str) -> RoomSummary:
    game_summary = None
    if room.game_setup is not None:
        room_store.get_room(room.room_id, session_player_id)
        current_time = datetime.now(UTC)
        reveal_all_cards = room.game_setup.stage == GameStage.finished
        reaction_window = None
        if room.game_setup.reaction_window is not None:
            seconds_remaining = max(
                0,
                int((room.game_setup.reaction_window.expires_at - current_time).total_seconds() + 0.999),
            )
            reaction_window = ReactionSummary(
                latest_discard_code=room.game_setup.reaction_window.latest_discard.code,
                seconds_remaining=seconds_remaining,
            )
        power_state = None
        if room.game_setup.power_state is not None and room.game_setup.power_state.actor_player_id == session_player_id:
            power_state = PowerSummary(
                action=room.game_setup.power_state.action,
                actor_player_id=room.game_setup.power_state.actor_player_id,
                awaiting_ready=room.game_setup.power_state.awaiting_ready,
                revealed_self_code=room.game_setup.power_state.revealed_self_code,
                revealed_target_code=room.game_setup.power_state.revealed_target_code,
                selected_target_player_id=room.game_setup.power_state.selected_target_player_id,
            )

        game_summary = GameSummary(
            stage=room.game_setup.stage,
            current_player_id=room.game_setup.current_player_id,
            draw_pile_count=room.game_setup.draw_pile_count,
            discard_pile_count=room.game_setup.discard_pile_count,
            reshuffle_count=room.game_setup.reshuffle_count,
            turn_phase=room.game_setup.turn_phase,
            pending_drawn_card_code=(
                room.game_setup.pending_drawn_card.code
                if room.game_setup.pending_drawn_card is not None and session_player_id == room.game_setup.current_player_id
                else None
            ),
            discard_pile_codes=[card.code for card in room.game_setup.discard_pile],
            reaction_window=reaction_window,
            power_state=power_state,
            kamboocha_caller_id=room.game_setup.kamboocha_caller_id,
            final_round_remaining_player_ids=room.game_setup.final_round_remaining_player_ids,
            winner_player_ids=room.game_setup.winner_player_ids,
            players=[
                GamePlayerSummary(
                    player_id=player.player_id,
                    nickname=player.nickname,
                    seat_index=player.seat_index,
                    cards=[
                        CardSummary(
                            position=slot.position,
                            has_card=slot.card is not None,
                            code=(
                                slot.card.code
                                if slot.card is not None
                                and (reveal_all_cards or (player.player_id == session_player_id and slot.known_to_player))
                                else None
                            ),
                            known_to_player=(
                                slot.card is not None
                                and (reveal_all_cards or (player.player_id == session_player_id and slot.known_to_player))
                            ),
                        )
                        for slot in player.cards
                    ],
                    visible_card_count=sum(
                        1
                        for slot in player.cards
                        if slot.card is not None
                        and (reveal_all_cards or (player.player_id == session_player_id and slot.known_to_player))
                    ),
                    total_card_count=sum(1 for slot in player.cards if slot.card is not None),
                    penalty_cards=player.penalty_cards,
                    preview_ready=player.preview_ready,
                )
                for player in room.game_setup.players
            ],
        )

    return RoomSummary(
        session_player_id=session_player_id,
        room_id=room.room_id,
        code=room.code,
        host_id=room.host_id,
        status=room.status,
        min_players=room.min_players,
        max_players=room.max_players,
        created_at=room.created_at,
        players=[
            PlayerSummary(
                player_id=player.player_id,
                nickname=player.nickname,
                seat_index=player.seat_index,
                ready=player.ready,
                joined_at=player.joined_at,
            )
            for player in room.players
        ],
        game=game_summary,
    )


@router.post("", response_model=RoomSummary, status_code=status.HTTP_201_CREATED)
async def create_room(payload: CreateRoomRequest) -> RoomSummary:
    host_id = str(uuid4())
    room = room_store.create_room(
        host_id=host_id,
        nickname=payload.nickname.strip(),
        max_players=payload.max_players,
        created_at=datetime.now(UTC),
    )
    return _room_response(room, session_player_id=host_id)


@router.get("/{room_id}", response_model=RoomSummary)
async def get_room(room_id: str, player_id: str) -> RoomSummary:
    try:
        room = room_store.get_room(room_id=room_id, player_id=player_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _room_response(room, session_player_id=player_id)


@router.post("/join", response_model=RoomSummary)
async def join_room(payload: JoinRoomRequest) -> RoomSummary:
    player_id = str(uuid4())
    try:
        room = room_store.join_room(
            code=payload.code.strip().upper(),
            player_id=player_id,
            nickname=payload.nickname.strip(),
            joined_at=datetime.now(UTC),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=player_id)


@router.post("/{room_id}/ready", response_model=RoomSummary)
async def set_ready(room_id: str, payload: ReadyRequest) -> RoomSummary:
    try:
        room = room_store.set_ready(room_id=room_id, player_id=payload.player_id, ready=payload.ready)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/start", response_model=RoomSummary)
async def start_game(room_id: str, payload: StartGameRequest) -> RoomSummary:
    try:
        room = room_store.start_game(room_id=room_id, host_id=payload.player_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/opening-ready", response_model=RoomSummary)
async def confirm_opening_ready(room_id: str, payload: OpeningReadyRequest) -> RoomSummary:
    try:
        room = room_store.confirm_opening_ready(room_id=room_id, player_id=payload.player_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/draw", response_model=RoomSummary)
async def draw_card(room_id: str, payload: TurnActionRequest) -> RoomSummary:
    try:
        room = room_store.draw_card(room_id=room_id, player_id=payload.player_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/discard", response_model=RoomSummary)
async def discard_card(room_id: str, payload: TurnActionRequest) -> RoomSummary:
    try:
        room = room_store.discard_drawn_card(room_id=room_id, player_id=payload.player_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/power/start", response_model=RoomSummary)
async def start_power(room_id: str, payload: TurnActionRequest) -> RoomSummary:
    try:
        room = room_store.start_power_action(room_id=room_id, player_id=payload.player_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/power/resolve", response_model=RoomSummary)
async def resolve_power(room_id: str, payload: PowerResolveRequest) -> RoomSummary:
    try:
        room = room_store.resolve_power_action(
            room_id=room_id,
            player_id=payload.player_id,
            self_position=payload.self_position,
            target_player_id=payload.target_player_id,
            target_position=payload.target_position,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/swap", response_model=RoomSummary)
async def swap_card(room_id: str, payload: SwapCardRequest) -> RoomSummary:
    try:
        room = room_store.swap_drawn_card(
            room_id=room_id,
            player_id=payload.player_id,
            position=payload.position,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/react", response_model=RoomSummary)
async def react_to_discard(room_id: str, payload: SwapCardRequest) -> RoomSummary:
    try:
        room = room_store.react_to_discard(
            room_id=room_id,
            player_id=payload.player_id,
            position=payload.position,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)


@router.post("/{room_id}/finalize", response_model=RoomSummary)
async def finalize_player_turn(room_id: str, payload: FinalizeTurnRequest) -> RoomSummary:
    try:
        room = room_store.finalize_turn(
            room_id=room_id,
            player_id=payload.player_id,
            call_kamboocha=payload.call_kamboocha,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _room_response(room, session_player_id=payload.player_id)
