from datetime import UTC, datetime
from enum import Enum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class Suit(str, Enum):
    clubs = "clubs"
    diamonds = "diamonds"
    hearts = "hearts"
    spades = "spades"


class Rank(str, Enum):
    ace = "A"
    two = "2"
    three = "3"
    four = "4"
    five = "5"
    six = "6"
    seven = "7"
    eight = "8"
    nine = "9"
    ten = "10"
    jack = "J"
    queen = "Q"
    king = "K"


CARD_VALUES: dict[Rank, int] = {
    Rank.ace: 0,
    Rank.two: 2,
    Rank.three: 3,
    Rank.four: 4,
    Rank.five: 5,
    Rank.six: 6,
    Rank.seven: 7,
    Rank.eight: 8,
    Rank.nine: 9,
    Rank.ten: 10,
    Rank.jack: 11,
    Rank.queen: 12,
    Rank.king: -1,
}


class Card(BaseModel):
    suit: Suit
    rank: Rank

    @property
    def code(self) -> str:
        return f"{self.rank.value}{self.suit.value[0].upper()}"

    @property
    def symbol(self) -> str:
        return {
            Suit.clubs: "♣",
            Suit.diamonds: "♦",
            Suit.hearts: "♥",
            Suit.spades: "♠",
        }[self.suit]

    @property
    def label(self) -> str:
        return f"{self.rank.value}{self.symbol}"

    @property
    def score(self) -> int:
        return CARD_VALUES[self.rank]


class CardSlot(BaseModel):
    position: int = Field(ge=0)
    card: Card | None
    known_to_player: bool = False


class GameStage(str, Enum):
    preview = "preview"
    active = "active"
    finished = "finished"


class TurnPhase(str, Enum):
    draw = "draw"
    resolve = "resolve"
    power = "power"
    post_turn = "post_turn"


class PowerAction(str, Enum):
    peek_self = "peek_self"
    peek_other = "peek_other"
    blind_swap = "blind_swap"
    insight_swap = "insight_swap"


class ReactionWindow(BaseModel):
    source_player_id: str
    target_rank: Rank
    latest_discard: Card
    opened_at: datetime
    expires_at: datetime
    attempted_player_ids: list[str] = Field(default_factory=list)


class PowerState(BaseModel):
    actor_player_id: str
    action: PowerAction
    drawn_card: Card
    awaiting_ready: bool = False
    selected_self_position: int | None = None
    selected_target_player_id: str | None = None
    selected_target_position: int | None = None
    revealed_self_code: str | None = None
    revealed_target_code: str | None = None


class SwapEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    kind: Literal["drawn", "player"]
    actor_player_id: str
    actor_position: int
    target_player_id: str | None = None
    target_position: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ActivityEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    kind: Literal[
        "game_started",
        "draw",
        "discard",
        "swap_drawn",
        "swap_player",
        "power_used",
        "reaction_match",
        "reaction_miss",
        "kamboocha",
        "turn_advanced",
        "match_finished",
    ]
    actor_player_id: str | None = None
    target_player_id: str | None = None
    actor_position: int | None = None
    target_position: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PlayerLayout(BaseModel):
    player_id: str
    nickname: str
    seat_index: int
    ready: bool = False
    preview_ready: bool = False
    joined_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    cards: list[CardSlot]
    penalty_cards: int = 0


class GameSetup(BaseModel):
    room_id: str
    players: list[PlayerLayout]
    draw_pile: list[Card]
    discard_pile: list[Card] = Field(default_factory=list)
    reshuffle_count: int = 0
    pending_drawn_card: Card | None = None
    swap_event: SwapEvent | None = None
    activity_event: ActivityEvent | None = None
    current_player_id: str
    stage: GameStage = GameStage.preview
    turn_phase: TurnPhase = TurnPhase.draw
    reaction_window: ReactionWindow | None = None
    power_state: PowerState | None = None
    kamboocha_caller_id: str | None = None
    final_round_remaining_player_ids: list[str] = Field(default_factory=list)
    winner_player_ids: list[str] = Field(default_factory=list)

    @property
    def draw_pile_count(self) -> int:
        return len(self.draw_pile)

    @property
    def discard_pile_count(self) -> int:
        return len(self.discard_pile)
