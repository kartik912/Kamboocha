from datetime import UTC, datetime, timedelta

import pytest

from app.domain.engine import (
    build_standard_deck,
    begin_power_action,
    confirm_preview_ready,
    deal_opening_layout,
    discard_pending_card,
    draw_turn_card,
    execute_power_action,
    finalize_turn,
    react_to_latest_discard,
    score_cards,
    swap_pending_card,
)
from app.domain.models import Card, GameStage, PowerAction, ReactionWindow, Rank, Suit, TurnPhase


def test_standard_deck_has_all_52_unique_cards() -> None:
    deck = build_standard_deck()

    assert len(deck) == 52
    assert len({card.code for card in deck}) == 52


def test_opening_layout_deals_four_cards_to_each_player() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2", "p3"],
        nicknames=["Asha", "Biren", "Caro"],
        seed=7,
    )

    assert len(game.players) == 3
    assert game.draw_pile_count == 40
    assert game.current_player_id == "p1"
    assert [slot.known_to_player for slot in game.players[0].cards] == [True, True, False, False]


def test_score_cards_uses_kamboocha_values() -> None:
    deck = build_standard_deck()
    sample = [deck[1], deck[2], deck[11], deck[12]]

    assert score_cards(sample) == 2 + 3 + 12 - 1


def test_draw_and_discard_advances_turn() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=11,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    draw_turn_card(game, player_id="p1")

    assert game.pending_drawn_card is not None
    assert game.turn_phase == TurnPhase.resolve
    assert game.draw_pile_count == 43

    discard_pending_card(game, player_id="p1")

    assert game.pending_drawn_card is None
    assert game.discard_pile_count == 1
    assert game.current_player_id == "p1"
    assert game.turn_phase == TurnPhase.post_turn


def test_swap_replaces_slot_and_hides_new_card() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=12,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")
    original = game.players[0].cards[0].card.code

    draw_turn_card(game, player_id="p1")
    drawn = game.pending_drawn_card.code if game.pending_drawn_card else None
    swap_pending_card(game, player_id="p1", position=0)

    assert game.players[0].cards[0].card.code == drawn
    assert game.players[0].cards[0].known_to_player is False
    assert game.discard_pile[-1].code == original
    assert game.reaction_window is not None
    assert game.reaction_window.latest_discard.code == original
    assert game.swap_event is not None
    assert game.swap_event.kind == "drawn"
    assert game.swap_event.actor_player_id == "p1"
    assert game.swap_event.actor_position == 0
    assert game.swap_event.target_player_id is None
    assert game.swap_event.target_position is None
    assert game.reaction_window.expires_at - game.reaction_window.opened_at == timedelta(seconds=10)


def test_swap_animation_blocks_actions_for_every_player_until_duration_passes() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=12,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")
    game.pending_drawn_card = build_standard_deck()[0]
    game.turn_phase = TurnPhase.resolve

    swap_pending_card(game, player_id="p1", position=0)

    wrong_position = next(
        slot.position
        for slot in game.players[1].cards
        if slot.card is not None and slot.card.rank != game.reaction_window.target_rank
    )
    with pytest.raises(ValueError, match="Wait for the card swap animation"):
        react_to_latest_discard(game, player_id="p2", position=wrong_position)

    game.swap_event.created_at -= timedelta(seconds=5, milliseconds=100)
    react_to_latest_discard(game, player_id="p2", position=wrong_position)
    assert game.reaction_window is not None
    assert "p2" in game.reaction_window.attempted_player_ids


def test_swap_rejects_empty_slot() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=12,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")
    game.players[0].cards[0].card = None

    draw_turn_card(game, player_id="p1")

    with pytest.raises(ValueError, match="already holds a card"):
        swap_pending_card(game, player_id="p1", position=0)


def test_reaction_blocks_repeated_attempts_from_the_same_player() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=13,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    draw_turn_card(game, player_id="p1")
    discard_pending_card(game, player_id="p1")

    wrong_position = next(
        slot.position
        for slot in game.players[1].cards
        if slot.card is not None and slot.card.rank != game.reaction_window.target_rank
    )
    react_to_latest_discard(game, player_id="p2", position=wrong_position)

    assert game.reaction_window is not None
    remaining_position = next(
        slot.position for slot in game.players[1].cards if slot.card is not None and slot.position != wrong_position
    )

    with pytest.raises(ValueError, match="already used your reaction"):
        react_to_latest_discard(game, player_id="p2", position=remaining_position)


def test_draw_reshuffles_discard_pile_when_draw_pile_runs_out() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=12,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    recyclable_cards = [
        Card(suit=Suit.clubs, rank=Rank.two),
        Card(suit=Suit.diamonds, rank=Rank.five),
        Card(suit=Suit.hearts, rank=Rank.queen),
    ]
    recyclable_codes = {card.code for card in recyclable_cards}
    game.draw_pile = []
    game.discard_pile = recyclable_cards

    draw_turn_card(game, player_id="p1")

    assert game.pending_drawn_card is not None
    assert game.pending_drawn_card.code in recyclable_codes
    assert game.draw_pile_count == 2
    assert game.discard_pile_count == 0
    assert game.reshuffle_count == 1


def test_penalty_draw_can_reshuffle_older_discards_without_losing_latest_discard() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=13,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    game.draw_pile = []
    game.discard_pile = [
        Card(suit=Suit.clubs, rank=Rank.two),
        Card(suit=Suit.diamonds, rank=Rank.five),
    ]
    latest_discard = Card(suit=Suit.hearts, rank=Rank.queen)
    current_time = datetime.now(UTC)
    game.reaction_window = ReactionWindow(
        source_player_id="p1",
        target_rank=latest_discard.rank,
        latest_discard=latest_discard,
        opened_at=current_time,
        expires_at=current_time + timedelta(seconds=5),
    )
    game.discard_pile.append(latest_discard)

    wrong_position = next(slot.position for slot in game.players[1].cards if slot.card is not None and slot.card.rank != latest_discard.rank)

    react_to_latest_discard(game, player_id="p2", position=wrong_position)

    assert game.players[1].penalty_cards == 1
    assert game.reshuffle_count == 1
    assert game.discard_pile_count == 1
    assert game.discard_pile[-1].code == latest_discard.code
    assert game.reaction_window is not None


def test_failed_reaction_adds_penalty_card_and_keeps_window_open() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=13,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    draw_turn_card(game, player_id="p1")
    discard_pending_card(game, player_id="p1")
    before_draw_count = game.draw_pile_count
    before_total_cards = sum(1 for slot in game.players[1].cards if slot.card is not None)

    wrong_position = next(
        slot.position
        for slot in game.players[1].cards
        if slot.card is not None and slot.card.rank != game.reaction_window.target_rank
    )
    react_to_latest_discard(game, player_id="p2", position=wrong_position)

    after_total_cards = sum(1 for slot in game.players[1].cards if slot.card is not None)
    assert game.players[1].penalty_cards == 1
    assert after_total_cards == before_total_cards + 1
    assert game.draw_pile_count == before_draw_count - 1
    assert game.reaction_window is not None


def test_successful_reaction_discards_one_matching_card_and_closes_window() -> None:
    game = None
    matching_player = None

    for seed in range(1, 200):
        candidate = deal_opening_layout(
            room_id="room_alpha",
            player_ids=["p1", "p2", "p3"],
            nicknames=["Asha", "Biren", "Caro"],
            seed=seed,
        )
        confirm_preview_ready(candidate, player_id="p1")
        confirm_preview_ready(candidate, player_id="p2")
        confirm_preview_ready(candidate, player_id="p3")
        draw_turn_card(candidate, player_id="p1")
        discard_pending_card(candidate, player_id="p1")
        target_rank = candidate.reaction_window.target_rank

        matching_player = next(
            (
                player
                for player in candidate.players[1:]
                if any(slot.card is not None and slot.card.rank == target_rank for slot in player.cards)
            ),
            None,
        )
        if matching_player is not None:
            game = candidate
            break

    assert game is not None
    assert matching_player is not None

    target_rank = game.reaction_window.target_rank
    matching_slot = next(
        slot
        for slot in matching_player.cards
        if slot.card is not None and slot.card.rank == target_rank
    )

    react_to_latest_discard(game, player_id=matching_player.player_id, position=matching_slot.position)

    assert matching_slot.card is None
    assert game.reaction_window is None
    assert game.discard_pile[-1].rank == target_rank

    another_player = next(player for player in game.players if player.player_id not in {"p1", matching_player.player_id})
    another_slot = next(slot for slot in another_player.cards if slot.card is not None)

    with pytest.raises(ValueError, match="There is no active discard to match"):
        react_to_latest_discard(game, player_id=another_player.player_id, position=another_slot.position)


def test_failed_reaction_allows_later_success_while_timer_is_active() -> None:
    game = None
    reacting_player = None
    succeeding_player = None
    wrong_position = None
    correct_position = None

    for seed in range(1, 300):
        candidate = deal_opening_layout(
            room_id="room_alpha",
            player_ids=["p1", "p2", "p3"],
            nicknames=["Asha", "Biren", "Caro"],
            seed=seed,
        )
        confirm_preview_ready(candidate, player_id="p1")
        confirm_preview_ready(candidate, player_id="p2")
        confirm_preview_ready(candidate, player_id="p3")
        draw_turn_card(candidate, player_id="p1")
        discard_pending_card(candidate, player_id="p1")
        target_rank = candidate.reaction_window.target_rank

        for first in candidate.players[1:]:
            wrong_slot = next(
                (slot for slot in first.cards if slot.card is not None and slot.card.rank != target_rank),
                None,
            )
            if wrong_slot is None:
                continue
            for second in candidate.players[1:]:
                if second.player_id == first.player_id:
                    continue
                correct_slot = next(
                    (slot for slot in second.cards if slot.card is not None and slot.card.rank == target_rank),
                    None,
                )
                if correct_slot is not None:
                    game = candidate
                    reacting_player = first
                    succeeding_player = second
                    wrong_position = wrong_slot.position
                    correct_position = correct_slot.position
                    break
            if game is not None:
                break
        if game is not None:
            break

    assert game is not None
    assert reacting_player is not None
    assert succeeding_player is not None
    assert wrong_position is not None
    assert correct_position is not None

    react_to_latest_discard(game, player_id=reacting_player.player_id, position=wrong_position)

    assert game.reaction_window is not None

    react_to_latest_discard(game, player_id=succeeding_player.player_id, position=correct_position)

    assert game.reaction_window is None


def test_seven_power_reveals_one_of_your_own_cards_and_discards_seven() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=21,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    player = game.players[0]
    player.cards[2].known_to_player = False
    game.pending_drawn_card = build_standard_deck()[6]
    game.turn_phase = TurnPhase.resolve

    begin_power_action(game, player_id="p1")
    assert game.power_state.action == PowerAction.peek_self

    execute_power_action(game, player_id="p1", self_position=2)

    assert player.cards[2].known_to_player is True
    assert game.power_state is not None
    assert game.power_state.awaiting_ready is True
    assert game.reaction_window is None

    execute_power_action(game, player_id="p1", self_position=2)

    assert player.cards[2].known_to_player is False
    assert game.reaction_window is not None
    assert game.discard_pile[-1].rank.value == "7"
    assert game.turn_phase == TurnPhase.post_turn


def test_eight_power_reveals_other_player_card_to_actor_only() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=22,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    target_code = game.players[1].cards[0].card.code
    game.pending_drawn_card = build_standard_deck()[7]
    game.turn_phase = TurnPhase.resolve

    begin_power_action(game, player_id="p1")
    execute_power_action(game, player_id="p1", target_player_id="p2", target_position=0)

    assert game.power_state is not None
    assert game.power_state.awaiting_ready is True
    assert game.reaction_window is None

    execute_power_action(game, player_id="p1", target_player_id="p2", target_position=0)

    assert game.reaction_window is not None
    assert game.discard_pile[-1].rank.value == "8"
    assert game.turn_phase == TurnPhase.post_turn
    assert target_code is not None


def test_jack_power_blind_swaps_cards_and_discards_jack() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=23,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    left = game.players[0].cards[0].card.code
    right = game.players[1].cards[0].card.code
    game.pending_drawn_card = build_standard_deck()[10]
    game.turn_phase = TurnPhase.resolve

    begin_power_action(game, player_id="p1")
    execute_power_action(game, player_id="p1", self_position=0, target_player_id="p2", target_position=0)

    assert game.players[0].cards[0].card.code == right
    assert game.players[1].cards[0].card.code == left
    assert game.discard_pile[-1].rank.value == "J"
    assert game.turn_phase == TurnPhase.post_turn
    assert game.swap_event is not None
    assert game.swap_event.kind == "player"
    assert game.swap_event.actor_player_id == "p1"
    assert game.swap_event.actor_position == 0
    assert game.swap_event.target_player_id == "p2"
    assert game.swap_event.target_position == 0
    assert game.reaction_window is not None
    assert game.reaction_window.expires_at - game.reaction_window.opened_at == timedelta(seconds=10)


def test_queen_power_reveals_both_cards_then_swaps_on_second_resolve() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=24,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    own_code = game.players[0].cards[1].card.code
    target_code = game.players[1].cards[1].card.code
    game.pending_drawn_card = build_standard_deck()[11]
    game.turn_phase = TurnPhase.resolve

    begin_power_action(game, player_id="p1")
    execute_power_action(game, player_id="p1", self_position=1, target_player_id="p2", target_position=1)

    assert game.swap_event is None
    assert game.power_state is not None
    assert game.power_state.revealed_self_code == own_code
    assert game.power_state.revealed_target_code == target_code
    assert game.power_state.awaiting_ready is True

    execute_power_action(game, player_id="p1", self_position=1, target_player_id="p2", target_position=1)

    assert game.players[0].cards[1].card.code == target_code
    assert game.players[1].cards[1].card.code == own_code
    assert game.discard_pile[-1].rank.value == "Q"
    assert game.power_state is None
    assert game.swap_event is not None
    assert game.swap_event.kind == "player"
    assert game.swap_event.actor_player_id == "p1"
    assert game.swap_event.actor_position == 1
    assert game.swap_event.target_player_id == "p2"
    assert game.swap_event.target_position == 1
    assert game.reaction_window is not None
    assert game.reaction_window.expires_at - game.reaction_window.opened_at == timedelta(seconds=10)


def test_queen_power_can_be_skipped_after_reveal_without_swapping() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=24,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    own_code = game.players[0].cards[1].card.code
    target_code = game.players[1].cards[1].card.code
    game.pending_drawn_card = build_standard_deck()[11]
    game.turn_phase = TurnPhase.resolve

    begin_power_action(game, player_id="p1")
    execute_power_action(game, player_id="p1", self_position=1, target_player_id="p2", target_position=1)

    execute_power_action(game, player_id="p1", skip_swap=True)

    assert game.players[0].cards[1].card.code == own_code
    assert game.players[1].cards[1].card.code == target_code
    assert game.discard_pile[-1].rank.value == "Q"
    assert game.power_state is None
    assert game.swap_event is None


def test_queen_power_can_choose_a_different_slot_from_the_revealed_player() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2"],
        nicknames=["Asha", "Biren"],
        seed=24,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")

    own_code = game.players[0].cards[0].card.code
    other_target_code = game.players[1].cards[2].card.code
    game.pending_drawn_card = build_standard_deck()[11]
    game.turn_phase = TurnPhase.resolve

    begin_power_action(game, player_id="p1")
    execute_power_action(game, player_id="p1", self_position=1, target_player_id="p2", target_position=1)

    execute_power_action(game, player_id="p1", self_position=0, target_player_id="p2", target_position=2)

    assert game.players[0].cards[0].card.code == other_target_code
    assert game.players[1].cards[2].card.code == own_code
    assert game.power_state is None


def test_queen_power_rejects_swap_with_a_different_player_than_revealed() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2", "p3"],
        nicknames=["Asha", "Biren", "Caro"],
        seed=24,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")
    confirm_preview_ready(game, player_id="p3")

    game.pending_drawn_card = build_standard_deck()[11]
    game.turn_phase = TurnPhase.resolve

    begin_power_action(game, player_id="p1")
    execute_power_action(game, player_id="p1", self_position=1, target_player_id="p2", target_position=1)

    with pytest.raises(ValueError, match="only swap with the player"):
        execute_power_action(game, player_id="p1", self_position=1, target_player_id="p3", target_position=1)


def test_kamboocha_gives_every_other_player_one_final_turn_and_finishes() -> None:
    game = deal_opening_layout(
        room_id="room_alpha",
        player_ids=["p1", "p2", "p3"],
        nicknames=["Asha", "Biren", "Caro"],
        seed=25,
    )
    confirm_preview_ready(game, player_id="p1")
    confirm_preview_ready(game, player_id="p2")
    confirm_preview_ready(game, player_id="p3")

    game.pending_drawn_card = build_standard_deck()[0]
    game.turn_phase = TurnPhase.resolve
    discard_pending_card(game, player_id="p1")
    game.reaction_window = None

    finalize_turn(game, player_id="p1", call_kamboocha=True)

    assert game.kamboocha_caller_id == "p1"
    assert game.current_player_id == "p2"
    assert game.final_round_remaining_player_ids == ["p2", "p3"]

    for player_id in ["p2", "p3"]:
        game.pending_drawn_card = build_standard_deck()[1]
        game.turn_phase = TurnPhase.resolve
        discard_pending_card(game, player_id=player_id)
        game.reaction_window = None
        finalize_turn(game, player_id=player_id, call_kamboocha=False)

    assert game.stage == GameStage.finished
    assert len(game.winner_player_ids) >= 1
