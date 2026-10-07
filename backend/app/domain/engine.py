from datetime import UTC, datetime, timedelta
from random import Random
from typing import Sequence

from app.domain.models import ActivityEvent, Card, CardSlot, GameSetup, GameStage, PlayerLayout, PowerAction, PowerState, Rank, ReactionWindow, Suit, SwapEvent, TurnPhase

SWAP_ANIMATION_DURATION = timedelta(seconds=5)


def build_standard_deck() -> list[Card]:
    return [Card(suit=suit, rank=rank) for suit in Suit for rank in Rank]


def shuffled_deck(seed: int | None = None) -> list[Card]:
    deck = build_standard_deck()
    Random(seed).shuffle(deck)
    return deck


def score_cards(cards: Sequence[Card]) -> int:
    return sum(card.score for card in cards)


def sync_timers(game: GameSetup, now: datetime | None = None) -> GameSetup:
    current_time = now or datetime.now(UTC)
    if game.reaction_window is not None and current_time >= game.reaction_window.expires_at:
        game.reaction_window = None
    return game


def rank_has_power(card: Card | None) -> bool:
    return card is not None and card.rank in {Rank.seven, Rank.eight, Rank.jack, Rank.queen}


def deal_opening_layout(
    room_id: str,
    player_ids: Sequence[str],
    nicknames: Sequence[str],
    seed: int | None = None,
) -> GameSetup:
    if len(player_ids) != len(nicknames):
        raise ValueError("Each player id must have a matching nickname.")

    if not 2 <= len(player_ids) <= 10:
        raise ValueError("Kamboocha requires between 2 and 10 players.")

    deck = shuffled_deck(seed)
    players: list[PlayerLayout] = []

    for seat_index, (player_id, nickname) in enumerate(zip(player_ids, nicknames, strict=True)):
        dealt_cards = [deck.pop() for _ in range(4)]
        players.append(
            PlayerLayout(
                player_id=player_id,
                nickname=nickname,
                seat_index=seat_index,
                cards=[
                    CardSlot(position=position, card=card, known_to_player=position in {0, 1})
                    for position, card in enumerate(dealt_cards)
                ],
            )
        )

    return GameSetup(
        room_id=room_id,
        players=players,
        draw_pile=deck,
        current_player_id=player_ids[0],
    )


def confirm_preview_ready(game: GameSetup, player_id: str) -> GameSetup:
    if game.stage != GameStage.preview:
        raise ValueError("Opening preview is already complete.")

    player = next((item for item in game.players if item.player_id == player_id), None)
    if player is None:
        raise ValueError("Player was not found in this game.")

    player.preview_ready = True
    for slot in player.cards:
        slot.known_to_player = False

    if all(item.preview_ready for item in game.players):
        game.stage = GameStage.active
        _record_activity(game, "game_started", player_id)
    return game


def draw_turn_card(game: GameSetup, player_id: str) -> GameSetup:
    sync_timers(game)
    _ensure_swap_animation_complete(game)
    if game.stage != GameStage.active:
        raise ValueError("The game is still in the opening preview phase.")
    if game.current_player_id != player_id:
        raise ValueError("It is not this player's turn.")
    if game.reaction_window is not None:
        raise ValueError("Wait for the discard reaction window to finish.")
    if game.turn_phase != TurnPhase.draw:
        raise ValueError("The current player must resolve their drawn card first.")
    _ensure_draw_cards_available(game)
    if not game.draw_pile:
        raise ValueError("The draw pile is empty.")

    game.pending_drawn_card = game.draw_pile.pop()
    game.turn_phase = TurnPhase.resolve
    _record_activity(game, "draw", player_id)
    return game


def begin_power_action(game: GameSetup, player_id: str) -> GameSetup:
    sync_timers(game)
    _ensure_swap_animation_complete(game)
    if game.stage != GameStage.active:
        raise ValueError("The game is still in the opening preview phase.")
    if game.current_player_id != player_id:
        raise ValueError("It is not this player's turn.")
    if game.turn_phase != TurnPhase.resolve or game.pending_drawn_card is None:
        raise ValueError("There is no drawn card to use as a power.")
    if not rank_has_power(game.pending_drawn_card):
        raise ValueError("This drawn card has no special ability.")

    action = {
        Rank.seven: PowerAction.peek_self,
        Rank.eight: PowerAction.peek_other,
        Rank.jack: PowerAction.blind_swap,
        Rank.queen: PowerAction.insight_swap,
    }[game.pending_drawn_card.rank]
    game.power_state = PowerState(actor_player_id=player_id, action=action, drawn_card=game.pending_drawn_card)
    game.turn_phase = TurnPhase.power
    _record_activity(game, "power_started", player_id, power_action=action, power_stage="started")
    return game


def discard_pending_card(game: GameSetup, player_id: str) -> GameSetup:
    sync_timers(game)
    _ensure_swap_animation_complete(game)
    if game.stage != GameStage.active:
        raise ValueError("The game is still in the opening preview phase.")
    if game.current_player_id != player_id:
        raise ValueError("It is not this player's turn.")
    if game.turn_phase != TurnPhase.resolve or game.pending_drawn_card is None:
        raise ValueError("There is no drawn card to discard.")

    discarded_card = game.pending_drawn_card
    _push_discard_and_open_reaction(game, discarded_card, player_id=player_id)
    game.pending_drawn_card = None
    _enter_post_turn(game)
    _record_activity(game, "discard", player_id)
    return game


def swap_pending_card(game: GameSetup, player_id: str, position: int) -> GameSetup:
    sync_timers(game)
    _ensure_swap_animation_complete(game)
    if game.stage != GameStage.active:
        raise ValueError("The game is still in the opening preview phase.")
    if game.current_player_id != player_id:
        raise ValueError("It is not this player's turn.")
    if game.turn_phase != TurnPhase.resolve or game.pending_drawn_card is None:
        raise ValueError("There is no drawn card to swap.")

    player = next((item for item in game.players if item.player_id == player_id), None)
    if player is None:
        raise ValueError("Player was not found in this game.")

    slot = next((item for item in player.cards if item.position == position), None)
    if slot is None:
        raise ValueError("Card slot was not found.")
    if slot.card is None:
        raise ValueError("Select a card slot that already holds a card to swap with the drawn card.")

    replaced_card = slot.card
    slot.card = game.pending_drawn_card
    slot.known_to_player = False
    game.swap_event = SwapEvent(kind="drawn", actor_player_id=player_id, actor_position=position)
    _record_activity(game, "swap_drawn", player_id, actor_position=position)
    _push_discard_and_open_reaction(
        game,
        replaced_card,
        player_id=player_id,
        animation_delay=SWAP_ANIMATION_DURATION,
    )
    game.pending_drawn_card = None
    _enter_post_turn(game)
    return game


def execute_power_action(
    game: GameSetup,
    player_id: str,
    self_position: int | None = None,
    target_player_id: str | None = None,
    target_position: int | None = None,
    skip_swap: bool = False,
) -> GameSetup:
    sync_timers(game)
    _ensure_swap_animation_complete(game)
    if game.stage != GameStage.active:
        raise ValueError("The game is still in the opening preview phase.")
    if game.turn_phase != TurnPhase.power or game.power_state is None:
        raise ValueError("There is no power action waiting to be resolved.")
    if game.power_state.actor_player_id != player_id:
        raise ValueError("Only the current acting player can resolve this power.")

    actor = _get_player(game, player_id)
    action = game.power_state.action

    if action == PowerAction.peek_self:
        if game.power_state.awaiting_ready:
            slot = _get_slot(actor, game.power_state.selected_self_position)
            if slot.card is None:
                raise ValueError("Card slot was not found.")
            slot.known_to_player = False
            _record_activity(game, "power_resolved", player_id, power_action=action, power_stage="resolved")
            _finish_power_discard(game, player_id)
            return game

        slot = _get_slot(actor, self_position)
        if slot.card is None:
            raise ValueError("Card slot was not found.")
        slot.known_to_player = True
        game.power_state.selected_self_position = self_position
        game.power_state.revealed_self_code = slot.card.code
        game.power_state.awaiting_ready = True
        _record_activity(game, "power_selecting", player_id, power_action=action, power_stage="selecting")
        return game

    if action == PowerAction.peek_other:
        if game.power_state.awaiting_ready:
            _record_activity(game, "power_resolved", player_id, power_action=action, power_stage="resolved")
            _finish_power_discard(game, player_id)
            return game

        target_player = _get_other_player(game, player_id, target_player_id)
        slot = _get_slot(target_player, target_position)
        if slot.card is None:
            raise ValueError("Card slot was not found.")
        game.power_state.selected_target_player_id = target_player_id
        game.power_state.selected_target_position = target_position
        game.power_state.revealed_target_code = slot.card.code
        game.power_state.awaiting_ready = True
        _record_activity(game, "power_selecting", player_id, power_action=action, power_stage="selecting")
        return game

    if action == PowerAction.insight_swap:
        if not game.power_state.awaiting_ready:
            own_slot = _get_slot(actor, self_position)
            target_player = _get_other_player(game, player_id, target_player_id)
            target_slot = _get_slot(target_player, target_position)
            if own_slot.card is None or target_slot.card is None:
                raise ValueError("Card slot was not found.")

            game.power_state.selected_self_position = self_position
            game.power_state.selected_target_player_id = target_player_id
            game.power_state.selected_target_position = target_position
            game.power_state.revealed_self_code = own_slot.card.code
            game.power_state.revealed_target_code = target_slot.card.code
            game.power_state.awaiting_ready = True
            _record_activity(game, "power_deciding", player_id, power_action=action, power_stage="deciding")
            return game

        if skip_swap:
            _record_activity(game, "power_resolved", player_id, power_action=action, power_stage="resolved")
            _finish_power_discard(game, player_id)
            return game

        if target_player_id != game.power_state.selected_target_player_id:
            raise ValueError("You can only swap with the player whose card you revealed.")

        own_slot = _get_slot(actor, self_position)
        target_player = _get_other_player(game, player_id, target_player_id)
        target_slot = _get_slot(target_player, target_position)
        if own_slot.card is None or target_slot.card is None:
            raise ValueError("Card slot was not found.")

        own_slot.card, target_slot.card = target_slot.card, own_slot.card
        own_slot.known_to_player = False
        target_slot.known_to_player = False
        game.swap_event = SwapEvent(
            kind="player",
            actor_player_id=player_id,
            actor_position=self_position,
            target_player_id=target_player_id,
            target_position=target_position,
        )
        _record_activity(
            game,
            "swap_player",
            player_id,
            target_player_id=target_player_id,
            actor_position=self_position,
            target_position=target_position,
            power_action=action,
            power_stage="resolved",
        )
        _finish_power_discard(game, player_id, animation_delay=SWAP_ANIMATION_DURATION)
        return game

    own_slot = _get_slot(actor, self_position)
    target_player = _get_other_player(game, player_id, target_player_id)
    target_slot = _get_slot(target_player, target_position)
    if own_slot.card is None or target_slot.card is None:
        raise ValueError("Card slot was not found.")

    own_slot.card, target_slot.card = target_slot.card, own_slot.card
    own_slot.known_to_player = False
    target_slot.known_to_player = False
    game.swap_event = SwapEvent(
        kind="player",
        actor_player_id=player_id,
        actor_position=self_position,
        target_player_id=target_player_id,
        target_position=target_position,
    )
    _record_activity(
        game,
        "swap_player",
        player_id,
        target_player_id=target_player_id,
        actor_position=self_position,
        target_position=target_position,
        power_action=action,
        power_stage="resolved",
    )
    _finish_power_discard(game, player_id, animation_delay=SWAP_ANIMATION_DURATION)
    return game


def finalize_turn(game: GameSetup, player_id: str, call_kamboocha: bool) -> GameSetup:
    sync_timers(game)
    _ensure_swap_animation_complete(game)
    if game.stage != GameStage.active:
        raise ValueError("The game is not active.")
    if game.current_player_id != player_id:
        raise ValueError("It is not this player's turn.")
    if game.turn_phase != TurnPhase.post_turn:
        raise ValueError("The current turn is not ready to be finalized.")
    if game.reaction_window is not None:
        raise ValueError("Wait for the discard reaction window to finish.")

    if call_kamboocha and game.kamboocha_caller_id is None:
        game.kamboocha_caller_id = player_id
        game.final_round_remaining_player_ids = _remaining_players_after(game, player_id)

    if game.final_round_remaining_player_ids:
        current_index = next(
            (index for index, pending_player_id in enumerate(game.final_round_remaining_player_ids) if pending_player_id == player_id),
            None,
        )
        if current_index is not None:
            game.final_round_remaining_player_ids.pop(current_index)

    if game.kamboocha_caller_id is not None and not game.final_round_remaining_player_ids:
        _finish_game(game)
        _record_activity(game, "match_finished", player_id)
        return game

    next_player_id = _next_player_id(game, player_id)
    _advance_turn(game)
    if call_kamboocha and game.kamboocha_caller_id == player_id:
        _record_activity(game, "kamboocha", player_id)
    else:
        _record_activity(game, "turn_advanced", player_id, target_player_id=next_player_id)
    return game


def react_to_latest_discard(game: GameSetup, player_id: str, position: int) -> GameSetup:
    sync_timers(game)
    _ensure_swap_animation_complete(game)
    if game.stage != GameStage.active:
        raise ValueError("The game is still in the opening preview phase.")
    if game.reaction_window is None:
        raise ValueError("There is no active discard to match.")
    if game.reaction_window.source_player_id == player_id:
        raise ValueError("The player who made the discard cannot claim it back.")
    if player_id in game.reaction_window.attempted_player_ids:
        raise ValueError("You have already used your reaction for this discard.")

    player = next((item for item in game.players if item.player_id == player_id), None)
    if player is None:
        raise ValueError("Player was not found in this game.")

    slot = next((item for item in player.cards if item.position == position), None)
    if slot is None or slot.card is None:
        raise ValueError("Card slot was not found.")

    game.reaction_window.attempted_player_ids.append(player_id)

    if slot.card.rank != game.reaction_window.target_rank:
        _add_penalty_card(game, player)
        _record_activity(game, "reaction_miss", player_id)
        return game

    game.discard_pile.append(slot.card)
    slot.card = None
    slot.known_to_player = False
    game.reaction_window = None
    _record_activity(game, "reaction_match", player_id)
    return game


def _push_discard_and_open_reaction(
    game: GameSetup,
    discarded_card: Card,
    player_id: str,
    animation_delay: timedelta = timedelta(),
) -> GameSetup:
    game.discard_pile.append(discarded_card)
    current_time = datetime.now(UTC)
    game.reaction_window = ReactionWindow(
        source_player_id=player_id,
        target_rank=discarded_card.rank,
        latest_discard=discarded_card,
        opened_at=current_time,
        expires_at=current_time + timedelta(seconds=5) + animation_delay,
    )
    return game


def _finish_power_discard(
    game: GameSetup,
    player_id: str,
    animation_delay: timedelta = timedelta(),
) -> GameSetup:
    if game.power_state is None:
        raise ValueError("There is no power action waiting to be resolved.")
    _push_discard_and_open_reaction(
        game,
        game.power_state.drawn_card,
        player_id=player_id,
        animation_delay=animation_delay,
    )
    game.pending_drawn_card = None
    game.power_state = None
    _enter_post_turn(game)
    return game


def _add_penalty_card(game: GameSetup, player: PlayerLayout) -> GameSetup:
    _ensure_draw_cards_available(game, preserve_latest_discard=game.reaction_window is not None)
    if not game.draw_pile:
        raise ValueError("No penalty card is available because the draw pile is empty.")

    penalty_card = game.draw_pile.pop()
    next_position = max((slot.position for slot in player.cards), default=-1) + 1
    empty_slot = next((slot for slot in player.cards if slot.card is None), None)

    if empty_slot is not None:
        empty_slot.card = penalty_card
        empty_slot.known_to_player = False
    else:
        player.cards.append(
            CardSlot(
                position=next_position,
                card=penalty_card,
                known_to_player=False,
            )
        )

    player.penalty_cards += 1
    return game


def _ensure_draw_cards_available(game: GameSetup, preserve_latest_discard: bool = False) -> GameSetup:
    if game.draw_pile:
        return game

    if preserve_latest_discard and game.discard_pile:
        recyclable_cards = game.discard_pile[:-1]
    else:
        recyclable_cards = game.discard_pile[:]

    if not recyclable_cards:
        return game

    Random().shuffle(recyclable_cards)
    game.draw_pile.extend(recyclable_cards)
    game.reshuffle_count += 1

    if preserve_latest_discard and game.discard_pile:
        game.discard_pile = [game.discard_pile[-1]]
    else:
        game.discard_pile = []

    return game


def _enter_post_turn(game: GameSetup) -> GameSetup:
    game.turn_phase = TurnPhase.post_turn
    return game


def _ensure_swap_animation_complete(game: GameSetup) -> None:
    if game.swap_event is None:
        return
    animation_ends_at = game.swap_event.created_at + SWAP_ANIMATION_DURATION
    if datetime.now(UTC) < animation_ends_at:
        raise ValueError("Wait for the card swap animation to finish.")


def _record_activity(
    game: GameSetup,
    kind: str,
    actor_player_id: str | None,
    target_player_id: str | None = None,
    actor_position: int | None = None,
    target_position: int | None = None,
    power_action: PowerAction | None = None,
    power_stage: str | None = None,
) -> None:
    game.activity_event = ActivityEvent(
        kind=kind,
        actor_player_id=actor_player_id,
        target_player_id=target_player_id,
        actor_position=actor_position,
        target_position=target_position,
        power_action=power_action,
        power_stage=power_stage,
    )


def _next_player_id(game: GameSetup, player_id: str) -> str:
    if game.final_round_remaining_player_ids:
        return game.final_round_remaining_player_ids[0]
    player_index = next(index for index, player in enumerate(game.players) if player.player_id == player_id)
    return game.players[(player_index + 1) % len(game.players)].player_id


def _advance_turn(game: GameSetup) -> GameSetup:
    current_index = next(
        (index for index, player in enumerate(game.players) if player.player_id == game.current_player_id),
        None,
    )
    if current_index is None:
        raise ValueError("Current player was not found in this game.")

    if game.final_round_remaining_player_ids:
        game.current_player_id = game.final_round_remaining_player_ids[0]
    else:
        next_index = (current_index + 1) % len(game.players)
        game.current_player_id = game.players[next_index].player_id
    game.turn_phase = TurnPhase.draw
    game.pending_drawn_card = None
    game.power_state = None
    return game


def _finish_game(game: GameSetup) -> GameSetup:
    totals = []
    for player in game.players:
        total = sum(slot.card.score for slot in player.cards if slot.card is not None)
        totals.append((player.player_id, total))
    best_score = min(score for _, score in totals)
    game.winner_player_ids = [player_id for player_id, score in totals if score == best_score]
    game.stage = GameStage.finished
    game.turn_phase = TurnPhase.post_turn
    game.reaction_window = None
    game.pending_drawn_card = None
    game.power_state = None
    return game


def _get_player(game: GameSetup, player_id: str) -> PlayerLayout:
    player = next((item for item in game.players if item.player_id == player_id), None)
    if player is None:
        raise ValueError("Player was not found in this game.")
    return player


def _get_other_player(game: GameSetup, player_id: str, target_player_id: str | None) -> PlayerLayout:
    if target_player_id is None or target_player_id == player_id:
        raise ValueError("A different target player is required.")
    return _get_player(game, target_player_id)


def _get_slot(player: PlayerLayout, position: int | None) -> CardSlot:
    if position is None:
        raise ValueError("A card slot must be selected.")
    slot = next((item for item in player.cards if item.position == position), None)
    if slot is None:
        raise ValueError("Card slot was not found.")
    return slot


def _remaining_players_after(game: GameSetup, player_id: str) -> list[str]:
    start_index = next(
        (index for index, player in enumerate(game.players) if player.player_id == player_id),
        None,
    )
    if start_index is None:
        raise ValueError("Current player was not found in this game.")
    ordered = game.players[start_index + 1 :] + game.players[:start_index]
    return [player.player_id for player in ordered if player.player_id != player_id]
