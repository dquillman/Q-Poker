// Learning Engine for Q-Poker
// Provides equity calculation, hand range evaluation, EV calculation, and GTO recommendations

class LearningEngine {
    constructor(game) {
        this.game = game;
        this.handRanges = this.initializeHandRanges();
    }

    // Initialize standard poker hand ranges
    initializeHandRanges() {
        return {
            premium: ['AA', 'KK', 'QQ', 'AKs', 'AKo'],
            strong: ['JJ', 'TT', 'AQs', 'AQo', 'AJs', 'KQs'],
            playable: ['99', '88', '77', 'AJo', 'ATs', 'KJs', 'KQo', 'QJs'],
            speculative: ['66', '55', '44', '33', '22', 'A9s', 'A8s', 'KTs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s'],
            marginal: ['ATo', 'KJo', 'QJo', 'JTo', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s']
        };
    }

    // Get the category string for a 2-card hand
    getHandCategory(hand) {
        if (!hand || hand.length < 2) return 'junk';

        const val1 = hand[0].value;
        const val2 = hand[1].value;
        const v1 = hand[0].numericValue;
        const v2 = hand[1].numericValue;
        const s1 = hand[0].suit;
        const s2 = hand[1].suit;

        const isPair = v1 === v2;
        const isSuited = s1 === s2;
        const high = Math.max(v1, v2);
        const low = Math.min(v1, v2);

        // Convert cards to standard notation (e.g., 'AKs', '77', 'JTo')
        let notation = '';
        if (isPair) {
            notation = val1 + val2;
        } else {
            const hVal = v1 > v2 ? val1 : val2;
            const lVal = v1 > v2 ? val2 : val1;
            notation = hVal + lVal + (isSuited ? 's' : 'o');
        }

        // Check each range
        for (const [category, hands] of Object.entries(this.handRanges)) {
            if (hands.includes(notation)) return category;
        }

        // Fallback for hands not explicitly in ranges (true junk)
        return 'junk';
    }

    // Monte Carlo equity calculator - simulates random runouts
    calculateEquity(playerHand, communityCards, numOpponents = 1, iterations = 1000) {
        let wins = 0;
        let ties = 0;

        for (let i = 0; i < iterations; i++) {
            // Create a deck without known cards
            const usedCards = [...playerHand, ...communityCards];
            const availableDeck = this.createDeckExcluding(usedCards);

            // Deal remaining community cards if needed
            const fullBoard = [...communityCards];
            const cardsNeeded = 5 - communityCards.length;
            for (let j = 0; j < cardsNeeded; j++) {
                const randomIndex = Math.floor(Math.random() * availableDeck.length);
                fullBoard.push(availableDeck.splice(randomIndex, 1)[0]);
            }

            // Deal opponent hands
            const opponentHands = [];
            for (let opp = 0; opp < numOpponents; opp++) {
                const oppHand = [];
                for (let c = 0; c < 2; c++) {
                    const randomIndex = Math.floor(Math.random() * availableDeck.length);
                    oppHand.push(availableDeck.splice(randomIndex, 1)[0]);
                }
                opponentHands.push(oppHand);
            }

            // Evaluate all hands
            const playerHandValue = this.game.evaluateHand(playerHand, fullBoard);
            const opponentHandValues = opponentHands.map(hand => this.game.evaluateHand(hand, fullBoard));

            // Determine winner
            let playerWins = true;
            let isTie = false;

            for (const oppValue of opponentHandValues) {
                const comparison = this.compareHands(playerHandValue, oppValue);
                if (comparison < 0) {
                    playerWins = false;
                    break;
                } else if (comparison === 0) {
                    isTie = true;
                }
            }

            if (playerWins) {
                if (isTie) {
                    ties++;
                } else {
                    wins++;
                }
            }
        }

        return {
            winRate: wins / iterations,
            tieRate: ties / iterations,
            equity: (wins + ties * 0.5) / iterations
        };
    }

    // Create a deck excluding specific cards
    createDeckExcluding(excludedCards) {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const deck = [];

        for (let suit of suits) {
            for (let value of values) {
                const card = {
                    suit: suit,
                    value: value,
                    numericValue: this.game.getNumericValue(value),
                    color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
                };

                // Check if this card is excluded
                const isExcluded = excludedCards.some(c =>
                    c.suit === card.suit && c.value === card.value
                );

                if (!isExcluded) {
                    deck.push(card);
                }
            }
        }

        return deck;
    }

    // Compare two hand values (returns 1 if hand1 wins, -1 if hand2 wins, 0 if tie)
    compareHands(hand1, hand2) {
        if (hand1.rank !== hand2.rank) {
            return hand1.rank > hand2.rank ? 1 : -1;
        }

        // Same rank - compare tie-breakers
        const tb1 = hand1.tieBreaker || [];
        const tb2 = hand2.tieBreaker || [];

        for (let i = 0; i < Math.max(tb1.length, tb2.length); i++) {
            const val1 = tb1[i] || 0;
            const val2 = tb2[i] || 0;
            if (val1 !== val2) {
                return val1 > val2 ? 1 : -1;
            }
        }

        return 0; // True tie
    }

    // Calculate Expected Value for different actions
    calculateEV(action, equity, pot, callAmount, raiseAmount = 0) {
        const potOdds = callAmount / (pot + callAmount);

        switch (action) {
            case 'fold':
                return 0; // No gain or loss

            case 'call':
                // EV = (equity * final_pot) - call_amount
                const finalPotCall = pot + callAmount;
                return (equity * finalPotCall) - callAmount;

            case 'raise':
                // Simplified: assumes opponent calls with reasonable frequency
                const foldEquity = 0.3; // Estimate opponent folds 30% of the time
                const totalInvested = callAmount + raiseAmount;
                const finalPotRaise = pot + totalInvested * 2; // Assumes opponent calls

                // EV = (fold_equity * current_pot) + ((1 - fold_equity) * (equity * final_pot - total_invested))
                return (foldEquity * pot) + ((1 - foldEquity) * (equity * finalPotRaise - totalInvested));

            case 'check':
                // EV = equity * current_pot (no additional investment)
                return equity * pot;

            default:
                return 0;
        }
    }

    // Get optimal action based on GTO principles
    getOptimalAction(playerHand, communityCards, pot, currentBet, playerCurrentBet, playerChips, position, numOpponents) {
        const callAmount = currentBet - playerCurrentBet;
        const equity = this.calculateEquity(playerHand, communityCards, numOpponents, 500).equity;
        const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0;

        // Calculate EV for each action
        const evFold = 0;
        const evCall = callAmount > 0 ? this.calculateEV('call', equity, pot, callAmount) : null;
        const evCheck = currentBet === 0 ? this.calculateEV('check', equity, pot, 0) : null;
        const evRaise = this.calculateEV('raise', equity, pot, callAmount, Math.min(pot * 0.75, playerChips - callAmount));

        // Determine best action
        let bestAction = 'fold';
        let bestEV = evFold;
        let confidence = 'Low';

        if (evCheck !== null && evCheck > bestEV) {
            bestAction = 'check';
            bestEV = evCheck;
        }

        if (evCall !== null && evCall > bestEV) {
            bestAction = 'call';
            bestEV = evCall;
        }

        if (evRaise > bestEV && evRaise > 0) {
            bestAction = 'raise';
            bestEV = evRaise;
        }

        // Determine confidence based on EV difference
        const evDifference = Math.abs(bestEV);
        if (evDifference > pot * 0.3) {
            confidence = 'High';
        } else if (evDifference > pot * 0.1) {
            confidence = 'Medium';
        }

        return {
            action: bestAction,
            confidence: confidence,
            equity: equity,
            potOdds: potOdds,
            ev: {
                fold: evFold,
                call: evCall,
                check: evCheck,
                raise: evRaise
            }
        };
    }

    // Generate explanation for recommended action
    generateExplanation(recommendation, playerHand, communityCards, pot, callAmount, position) {
        if (!recommendation) return "No recommendation analysis available.";

        const action = recommendation.action || 'fold';
        const equity = (recommendation.equity !== undefined) ? recommendation.equity : 0;
        const potOdds = (recommendation.potOdds !== undefined) ? recommendation.potOdds : 0;

        const equityPercent = (equity * 100).toFixed(1);
        const potOddsPercent = (potOdds * 100).toFixed(1);

        let explanation = '';

        switch (action.toLowerCase()) {
            case 'fold':
                explanation = `Your hand has ${equityPercent}% equity, which doesn't justify calling $${callAmount}. `;
                if (potOdds > 0) {
                    explanation += `You'd need ${potOddsPercent}% equity to break even.`;
                }
                break;

            case 'call':
                explanation = `Your ${equityPercent}% equity justifies calling $${callAmount}. `;
                explanation += `Pot odds suggest ${potOddsPercent}% equity is the break-even point.`;
                break;

            case 'raise':
                explanation = `Your strong hand (${equityPercent}% equity) should be played aggressively for value. `;
                if (position === 'late') {
                    explanation += `Late position also provides a great opportunity to take control of the pot.`;
                }
                break;

            case 'check':
                explanation = `With ${equityPercent}% equity, checking allows you to see the next card or showdown for free. `;
                break;

            default:
                explanation = `The GTO recommendation for this spot is to ${action.toUpperCase()}.`;
        }

        return explanation || `Based on your ${equityPercent}% equity, ${action.toUpperCase()} is the mathematically favored play.`;
    }

    // Estimate opponent hand range based on actions
    estimateOpponentRange(position, action, gamePhase, betSize = 0, pot = 0) {
        let range = [];

        // Starting ranges by position
        const earlyRange = ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs'];
        const middleRange = [...earlyRange, '99', '88', 'AQo', 'AJs', 'KQs', 'KQo'];
        const lateRange = [...middleRange, '77', '66', 'AJo', 'ATs', 'KJs', 'QJs', 'JTs', 'T9s', '98s'];

        // Get base range by position
        if (position === 'early') {
            range = [...earlyRange];
        } else if (position === 'middle') {
            range = [...middleRange];
        } else {
            range = [...lateRange];
        }

        // Adjust based on action
        if (action === 'raise' || action === 'bet') {
            // Narrow range to stronger hands
            if (betSize > pot * 0.66) {
                // Large bet = very strong range
                range = range.filter(hand =>
                    ['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo'].includes(hand)
                );
            } else {
                // Standard raise
                range = range.filter(hand =>
                    !['66', '55', '44', '33', '22', 'T9s', '98s', '87s'].includes(hand)
                );
            }
        } else if (action === 'call') {
            // Calling range is wider, includes speculative hands
            range = [...range, '55', '44', '33', '22', 'A9s', 'A8s', 'KTs', 'QTs'];
        }

        return range;
    }

    // Get hand range strength category
    getHandRangeCategory(hand) {
        const handString = this.handToString(hand);

        for (const [category, hands] of Object.entries(this.handRanges)) {
            if (hands.includes(handString)) {
                return category;
            }
        }

        return 'weak';
    }

    // Convert hand to string notation (e.g., "AKs", "QQ")
    handToString(hand) {
        if (hand.length !== 2) return '';

        const card1 = hand[0];
        const card2 = hand[1];
        const val1 = card1.value;
        const val2 = card2.value;

        // Pair
        if (val1 === val2) {
            return val1 + val1;
        }

        // Suited or offsuit
        const suited = card1.suit === card2.suit;
        const highCard = card1.numericValue > card2.numericValue ? val1 : val2;
        const lowCard = card1.numericValue > card2.numericValue ? val2 : val1;

        return highCard + lowCard + (suited ? 's' : 'o');
    }

    // Calculate all possible outs for the current hand
    calculateOuts(playerHand, communityCards) {
        if (communityCards.length < 3) {
            return { total: 0, breakdown: {}, cards: [] };
        }

        const outs = {
            royalFlush: [],
            straightFlush: [],
            quads: [],
            fullHouse: [],
            flush: [],
            straight: [],
            trips: [],
            twoPair: [],
            pair: []
        };
        const overcards = []; // For secondary improvements not in the main total

        // Get available cards (not in hand or on board)
        const usedCards = [...playerHand, ...communityCards];
        const availableDeck = this.createDeckExcluding(usedCards);

        // Current hand evaluation
        const currentHand = this.game.evaluateHand(playerHand, communityCards);
        const uniqueOuts = new Set();
        const holeValues = playerHand.map(c => c.value);

        // Check each possible card
        for (const card of availableDeck) {
            const testBoard = [...communityCards, card];
            const newBoardHand = this.game.getBestHand(testBoard);
            const newHand = this.game.evaluateHand(playerHand, testBoard);

            // 1. Hand Rank must actually improve (e.g., High Card -> Pair)
            // This filters out simple kicker improvements from the core 'Outs' count
            if (newHand.rank > currentHand.rank) {

                // 2. Hand must be strictly better than the board itself
                // (Filters out board pairs that don't help player relatively)
                const relativeStrength = this.compareHands(newHand, newBoardHand);

                if (relativeStrength > 0) {
                    // 3. Must either match a hole card OR complete a strong drawing structure (Straight+)
                    const isHoleMatch = holeValues.includes(card.value);
                    const isStrongHand = newHand.rank >= 5;

                    if (isHoleMatch || isStrongHand) {
                        uniqueOuts.add(`${card.value}${card.suit}`);

                        // Categorize for breakdown
                        const rank = newHand.rank;
                        if (rank === 10) outs.royalFlush.push(card);
                        else if (rank === 9) outs.straightFlush.push(card);
                        else if (rank === 8) outs.quads.push(card);
                        else if (rank === 7) outs.fullHouse.push(card);
                        else if (rank === 6) outs.flush.push(card);
                        else if (rank === 5) outs.straight.push(card);
                        else if (rank === 4) outs.trips.push(card);
                        else if (rank === 3) outs.twoPair.push(card);
                        else if (rank === 2) outs.pair.push(card);
                    }
                }
            } else {
                // Secondary check for kicker improvements (Overcards)
                const comparison = this.compareHands(newHand, currentHand);
                if (comparison > 0) {
                    const boardValues = communityCards.map(c => c.numericValue);
                    const maxBoard = Math.max(...boardValues);
                    if (card.numericValue > maxBoard) {
                        overcards.push(card);
                    }
                }
            }
        }

        // Count for breakdown
        const breakdown = {};
        for (const [type, cards] of Object.entries(outs)) {
            if (cards.length > 0) {
                breakdown[type] = cards.length;
            }
        }

        return {
            total: uniqueOuts.size,
            breakdown: breakdown,
            cards: outs,
            overcards: overcards
        };
    }

    // Classify outs as clean or dirty
    classifyOuts(outs, communityCards) {
        const classification = {
            clean: [],
            dirty: [],
            explanation: []
        };

        // Flush outs are usually clean
        if (outs.cards.flush && outs.cards.flush.length > 0) {
            classification.clean.push(...outs.cards.flush);
            classification.explanation.push(`${outs.cards.flush.length} flush outs (clean)`);
        }

        // Straight outs can be dirty if board is paired or flush possible
        if (outs.cards.straight && outs.cards.straight.length > 0) {
            const boardPaired = this.isBoardPaired(communityCards);
            const flushPossible = this.isFlushPossible(communityCards);

            if (boardPaired || flushPossible) {
                classification.dirty.push(...outs.cards.straight);
                classification.explanation.push(`${outs.cards.straight.length} straight outs (dirty - board paired or flush possible)`);
            } else {
                classification.clean.push(...outs.cards.straight);
                classification.explanation.push(`${outs.cards.straight.length} straight outs (clean)`);
            }
        }

        // Pair/trips outs
        if (outs.cards.pair && outs.cards.pair.length > 0) {
            classification.clean.push(...outs.cards.pair);
            classification.explanation.push(`${outs.cards.pair.length} pair outs`);
        }

        if (outs.cards.trips && outs.cards.trips.length > 0) {
            classification.clean.push(...outs.cards.trips);
            classification.explanation.push(`${outs.cards.trips.length} trips outs`);
        }

        return classification;
    }

    // Check if board is paired
    isBoardPaired(communityCards) {
        const values = communityCards.map(c => c.value);
        return new Set(values).size < values.length;
    }

    // Check if flush is possible on board
    isFlushPossible(communityCards) {
        const suits = communityCards.map(c => c.suit);
        const suitCounts = {};
        suits.forEach(suit => suitCounts[suit] = (suitCounts[suit] || 0) + 1);
        return Object.values(suitCounts).some(count => count >= 3);
    }

    // Calculate implied odds
    calculateImpliedOdds(pot, callAmount, playerStack, opponentStack, outs) {
        if (outs === 0 || callAmount === 0) return 0;

        // Estimate how much more we can win if we hit
        const potentialWinnings = Math.min(opponentStack, playerStack);
        const impliedPot = pot + potentialWinnings;

        // Implied odds = call amount / (current pot + potential future bets)
        return callAmount / impliedPot;
    }

    // Rule of 2 and 4 calculation
    getRuleOf2And4(outs, street) {
        if (street === 'turn') {
            // One card to come: multiply by 2
            return (outs * 2).toFixed(1);
        } else if (street === 'flop') {
            // Two cards to come: multiply by 4
            return (outs * 4).toFixed(1);
        }
        return 0;
    }

    // Simulate what happens if we hit a specific out
    simulateOutcome(playerHand, communityCards, outCard) {
        const newBoard = [...communityCards, outCard];
        const newHand = this.game.evaluateHand(playerHand, newBoard);

        // Calculate equity with the new board
        const remainingCards = 5 - newBoard.length;
        if (remainingCards > 0) {
            const equity = this.calculateEquity(playerHand, newBoard, 1, 200);
            return {
                handName: newHand.name,
                equity: equity.equity,
                improved: true
            };
        }

        return {
            handName: newHand.name,
            equity: 1.0, // River card, no more cards to come
            improved: true
        };
    }
}



class RangeCalculator {
    constructor() {
        this.reset();
    }

    reset() {
        // 13x13 grid.
        // Index 0='A', 1='K', ... 12='2'
        // Cell value 0.0 to 1.0 (probability)
        this.grid = Array(13).fill().map(() => Array(13).fill(1.0));
    }

    // Return flat list of {label: "AKs", weight: 0.8, type: "pair"|"suited"|"offsuit"}
    getRangeGrid() {
        const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
        const result = [];

        for (let r1 = 0; r1 < 13; r1++) {
            for (let r2 = 0; r2 < 13; r2++) {
                let label, type;
                if (r1 === r2) {
                    label = ranks[r1] + ranks[r2];
                    type = 'pair';
                } else if (r1 < r2) {
                    label = ranks[r1] + ranks[r2] + 's';
                    type = 'suited';
                } else {
                    label = ranks[r2] + ranks[r1] + 'o';
                    type = 'offsuit';
                }

                result.push({
                    row: r1,
                    col: r2,
                    label: label,
                    weight: this.grid[r1][r2],
                    type: type
                });
            }
        }
        return result;
    }

    applyAction(action, phase) {
        // Simplified Range Narrowing Logic based on perceived actions
        // In real solver, this is complex. Here we use heuristics.

        for (let r1 = 0; r1 < 13; r1++) {
            for (let r2 = 0; r2 < 13; r2++) {
                // Determine hand strength roughly (lower index = stronger)
                const handStrengthVal = 26 - (r1 + r2); // 26 (AA) to 2 (22) roughly

                if (action === 'raise' || action === 'bet') {
                    // Aggression: Remove weak hands
                    // Weak is roughly bottom 50%
                    if (handStrengthVal < 14) {
                        this.grid[r1][r2] *= 0.2; // Significantly reduce probability
                    }
                } else if (action === 'call') {
                    // Call: Remove pure bluffs (very weak) and absolute nuts (often would raise)
                    // Remove 72o type trash
                    if (handStrengthVal < 8) {
                        this.grid[r1][r2] *= 0.1;
                    }
                    // Damping Top 5% (AA/KK often raise preflop)
                    if (phase === 'preflop' && r1 === r2 && r1 < 2) { // AA, KK
                        this.grid[r1][r2] *= 0.5;
                    }
                }
            }
        }
    }
}


class PreflopCharts {
    constructor() {
        // Simplified GTO Ranges (Opening Raise)
        // 1 = Raise, 0 = Fold
        this.ranges = {
            'UTG': {
                'premium': 1.0, 'strong': 1.0, 'playable': 0.5, 'speculative': 0.0, 'marginal': 0.0
            },
            'HJ': {
                'premium': 1.0, 'strong': 1.0, 'playable': 1.0, 'speculative': 0.2, 'marginal': 0.0
            },
            'CO': {
                'premium': 1.0, 'strong': 1.0, 'playable': 1.0, 'speculative': 0.8, 'marginal': 0.2
            },
            'BTN/SB/BB': {
                'premium': 1.0, 'strong': 1.0, 'playable': 1.0, 'speculative': 1.0, 'marginal': 0.8
            }
        };
        this.hands = new LearningEngine(null).initializeHandRanges();
    }

    getAction(position, handCategory) {
        if (!this.ranges[position]) return 'Fold';
        const freq = this.ranges[position][handCategory] || 0;
        if (freq === 1.0) return 'Raise';
        if (freq === 0.0) return 'Fold';
        return `Mix (${freq * 100}% Raise)`;
    }
}

// Export for use in HTML
window.LearningEngine = LearningEngine;
window.RangeCalculator = RangeCalculator;
window.PreflopCharts = PreflopCharts;
