// Poker Game Logic

class PokerGame {
  constructor() {
    this.version = '2.0.5';
    this.deck = [];
    this.players = [];
    this.communityCards = [];
    this.currentPlayerIndex = 0;
    this.dealerIndex = 0;
    this.pot = 0;
    this.currentBet = 0;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.gamePhase = 'waiting'; // waiting, preflop, flop, turn, river, showdown
    this.bettingRound = 0;
    this.lastBettor = -1;

    // Texas Hold'em rule enforcement
    this.lastRaiseSize = 0; // Track size of last raise for minimum raise rule
    this.sidePots = []; // Array of {amount, eligiblePlayers[]}

    // Elimination tracking
    this.eliminationOrder = []; // Track order of player elimination {name, placement, chips}
    this.gameOver = false; // Flag to indicate game is over for human player
    this.humanPlayerPlacement = null; // Final placement of human player

    // Learning features
    this.learningEngine = null; // Will be initialized after LearningEngine is loaded
    this.settings = {
      showHandStrength: true,
      enableCoachMode: false,
      postHandAnalysis: true,
      opponentProfiling: false,
      trainingMode: false
    };
    this.handHistory = [];
    this.currentHandLog = null;
    this.mistakeTracker = {
      totalHands: 0,
      mistakes: [],
      stats: {
        foldedTooOften: 0,
        calledTooWide: 0,
        missedValue: 0,
        poorBluffs: 0
      }
    };
    this.rangeCalculator = null;
    this.userStats = {
      handsDealt: 0,
      vpipCount: 0,
      pfrCount: 0,
      aggressionCount: 0,
      passiveCount: 0
    };

    // Bankroll Management
    this.bankrollManager = new BankrollManager();

    // UI Callback for animations
    this.onAction = null;

    this.initializePlayers();
    this.initializeLearningEngine();
  }

  initializePlayers() {
    // Create 9 players (1 human + 8 AI)
    // AI personalities: tightness (0-1), aggression (0-1), bluffFrequency (0-1)
    this.players = [
      {
        id: 0, name: 'You', chips: 1000, hand: [], isHuman: true, folded: false,
        currentBet: 0, hasActed: false, equity: 0, winProbability: 0
      },
      // 1. The Rock (Nit) - Very tight, passive
      {
        id: 1, name: 'Rocky (Rock)', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.9, aggression: 0.2, bluffFrequency: 0.05, archetype: 'rock'
      },
      // 2. The Maniac - Very loose, hyper-aggressive
      {
        id: 2, name: 'Mad Max (Maniac)', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.2, aggression: 0.95, bluffFrequency: 0.8, archetype: 'maniac'
      },
      // 3. Calling Station - Loose, passive, never folds
      {
        id: 3, name: 'Steve (Station)', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.1, aggression: 0.1, bluffFrequency: 0.0, archetype: 'station'
      },
      // 4. TAG (Tight Aggressive) - Standard good player
      {
        id: 4, name: 'Pro Phil (TAG)', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.7, aggression: 0.8, bluffFrequency: 0.3, archetype: 'tag'
      },
      // 5. LAG (Loose Aggressive) - Dangerous but risky
      {
        id: 5, name: 'Larry (LAG)', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.4, aggression: 0.8, bluffFrequency: 0.6, archetype: 'lag'
      },
      // 6. The Nit (Weak Tight) - Folds to any raise
      {
        id: 6, name: 'Nitty Nick', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.85, aggression: 0.1, bluffFrequency: 0.0, archetype: 'nit'
      },
      // 7. The Shark - Balanced GTO style
      {
        id: 7, name: 'Shark Sam', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.6, aggression: 0.7, bluffFrequency: 0.4, archetype: 'shark'
      },
      // 8. The Gambler - Random wild card
      {
        id: 8, name: 'Gary (Gambler)', chips: 1000, hand: [], isHuman: false, folded: false, currentBet: 0,
        tightness: 0.5, aggression: 0.9, bluffFrequency: 0.9, archetype: 'gambler'
      }
    ].map(p => ({ ...p, eliminated: false }));
  }

  createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.deck = [];

    for (let suit of suits) {
      for (let value of values) {
        this.deck.push({
          suit: suit,
          value: value,
          numericValue: this.getNumericValue(value),
          color: (suit === '♥' || suit === '♦') ? 'red' : 'black'
        });
      }
    }
  }

  getNumericValue(value) {
    const valueMap = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return valueMap[value];
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  eliminateBustedPlayers() {
    // Mark AI players as eliminated if they hit 0 chips
    this.players.forEach((player, index) => {
      if (!player.isHuman && player.chips <= 0 && !player.eliminated) {
        player.eliminated = true;
        player.folded = true; // Effectively folded for all rounds

        const activePlayersCount = this.players.filter(p => !p.eliminated).length;
        this.eliminationOrder.push({
          name: player.name,
          placement: activePlayersCount + 1,
          isHuman: false
        });
        console.log(`Eliminated: ${player.name} in seat ${index}`);
      }
    });

    // Special case: If only human player has chips left, they win!
    const activeAIs = this.players.filter(p => !p.isHuman && !p.eliminated);
    if (activeAIs.length === 0 && this.players[0].isHuman && this.players[0].chips > 0) {
      this.gameOver = true;
      this.humanPlayerPlacement = 1;

      const human = this.players[0];
      this.bankrollManager.cashOut(human.chips);
      human.chips = 0;
    }
  }

  startNewHand() {
    // 1. ARCHIVE PREVIOUS HAND LOG
    if (this.currentHandLog) {
      this.handHistory.push(this.currentHandLog);
      if (this.handHistory.length > 50) this.handHistory.shift();
      this.userStats.handsDealt++;

      // Save data periodically
      this.bankrollManager.saveData();
    }

    // 2. CHECK HUMAN BUST
    const human = this.players[0]; // Human is always 0
    if (human.chips <= 0) {
      this.gameOver = true;
      if (!this.humanPlayerPlacement) {
        // Calculate placement based on players remaining + 1
        this.humanPlayerPlacement = this.players.filter(p => !p.eliminated).length;
      }
      return;
    }

    // 3. INITIALIZE NEW LOG
    this.currentHandLog = {
      id: Date.now(),
      startTime: new Date().toLocaleTimeString(),
      holeCards: [],
      communityCards: [],
      actions: [],
      winner: null,
      pnl: 0,
      vpipTracked: false,
      pfrTracked: false,
      isScenario: false
    };

    // 4. RESET GAME STATE
    this.createDeck();
    this.shuffleDeck();
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.bettingRound = 0;
    this.lastBettor = -1;
    this.lastRaiseSize = 0;
    this.gamePhase = 'preflop';
    this.inShowdownUI = false;

    // Rotate dealer to next non-eliminated player
    let nextDealer = (this.dealerIndex + 1) % this.players.length;
    while (this.players[nextDealer].eliminated) {
      nextDealer = (nextDealer + 1) % this.players.length;
    }
    this.dealerIndex = nextDealer;

    // Reset players
    this.players.forEach(player => {
      player.hand = [];
      player.folded = player.eliminated || false;
      player.currentBet = 0;
      player.totalChipsBet = 0;
      player.hasActed = false;
      player.isSmallBlind = false;
      player.isBigBlind = false;
      player.isAllIn = false;
    });

    // Deal Cards
    for (let i = 0; i < 2; i++) {
      this.players.forEach(player => {
        if (!player.folded) {
          player.hand.push(this.deck.pop());
        }
      });
    }

    // Post Blinds
    this.postBlinds();

    // Set First to Act (UTG is 3 slots after dealer in 9-player, but skip eliminated)
    let fta = (this.dealerIndex + 3) % this.players.length;
    while (this.players[fta].eliminated || this.players[fta].isAllIn) {
      fta = (fta + 1) % this.players.length;
    }
    this.currentPlayerIndex = fta;
  }

  postBlinds() {
    // Find next non-eliminated player after dealer for Small Blind
    let sbIdx = (this.dealerIndex + 1) % this.players.length;
    while (this.players[sbIdx].eliminated) {
      sbIdx = (sbIdx + 1) % this.players.length;
    }

    // Find next non-eliminated player after Small Blind for Big Blind
    let bbIdx = (sbIdx + 1) % this.players.length;
    while (this.players[bbIdx].eliminated) {
      bbIdx = (bbIdx + 1) % this.players.length;
    }

    const smallBlindPlayer = this.players[sbIdx];
    const bigBlindPlayer = this.players[bbIdx];

    // Post small blind
    const sbAmount = Math.min(this.smallBlind, smallBlindPlayer.chips);
    smallBlindPlayer.chips -= sbAmount;
    smallBlindPlayer.currentBet = sbAmount;
    smallBlindPlayer.totalChipsBet = sbAmount;
    smallBlindPlayer.isSmallBlind = true;
    if (smallBlindPlayer.chips === 0) {
      smallBlindPlayer.isAllIn = true;
      smallBlindPlayer.hasActed = true;
    }
    this.pot += sbAmount;

    // Post big blind
    const bbAmount = Math.min(this.bigBlind, bigBlindPlayer.chips);
    bigBlindPlayer.chips -= bbAmount;
    bigBlindPlayer.currentBet = bbAmount;
    bigBlindPlayer.totalChipsBet = bbAmount;
    bigBlindPlayer.isBigBlind = true;
    if (bigBlindPlayer.chips === 0) {
      bigBlindPlayer.isAllIn = true;
      bigBlindPlayer.hasActed = true;
    }
    this.pot += bbAmount;

    this.currentBet = bbAmount;
  }


  dealFlop() {
    if (this.communityCards.length === 0 && this.gamePhase === 'preflop') {
      // Burn one card
      this.deck.pop();
      // Deal 3 cards
      for (let i = 0; i < 3; i++) {
        this.communityCards.push(this.deck.pop());
      }
      this.gamePhase = 'flop';
      this.resetBettingRound();
      this.updatePlayerEquity();
    }
  }

  dealTurn() {
    if (this.communityCards.length === 3 && this.gamePhase === 'flop') {
      // Burn one card
      this.deck.pop();
      // Deal 1 card
      this.communityCards.push(this.deck.pop());
      this.gamePhase = 'turn';
      this.resetBettingRound();
      this.updatePlayerEquity();
    }
  }

  dealRiver() {
    if (this.communityCards.length === 4 && this.gamePhase === 'turn') {
      // Burn one card
      this.deck.pop();
      // Deal 1 card
      this.communityCards.push(this.deck.pop());
      this.gamePhase = 'river';
      this.resetBettingRound();
      this.updatePlayerEquity();
    }
  }

  evaluateHand(playerHand, communityCards) {
    if (!playerHand || playerHand.length === 0) {
      return { rank: 0, name: 'No Hand', tieBreaker: [] };
    }
    const allCards = [...playerHand, ...communityCards];
    const hand = this.getBestHand(allCards);
    return hand;
  }

  getBestHand(cards) {
    // Sort cards by numeric value
    const sorted = [...cards].sort((a, b) => b.numericValue - a.numericValue);
    const valueCounts = this.getValueCounts(sorted);

    // Get sorted values by count (for tie-breaking)
    const valuesByCount = Object.entries(valueCounts)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]; // Sort by count first
        return this.getNumericValue(b[0]) - this.getNumericValue(a[0]); // Then by value
      })
      .map(([value, count]) => ({ value, count, numericValue: this.getNumericValue(value) }));

    // Check for each hand type (from best to worst)
    // Check for each hand type (from best to worst)
    if (this.isRoyalFlush(sorted)) {
      return { rank: 10, name: 'Royal Flush', tieBreaker: [14] };
    }

    const flushSuit = this.getFlushSuit(sorted);

    if (flushSuit) {
      // Optimization: Prepare flush cards once
      const flushCards = sorted.filter(c => c.suit === flushSuit);
      const straightHighCard = this.isStraight(flushCards);

      if (straightHighCard) {
        return { rank: 9, name: 'Straight Flush', tieBreaker: [straightHighCard] };
      }
    }

    if (this.isFourOfAKind(sorted)) {
      const quadValue = valuesByCount.find(v => v.count === 4).numericValue;
      const kicker = valuesByCount.find(v => v.count !== 4).numericValue;
      return { rank: 8, name: 'Four of a Kind', tieBreaker: [quadValue, kicker] };
    }
    if (this.isFullHouse(sorted)) {
      const tripValue = valuesByCount.find(v => v.count === 3).numericValue;
      // Filter out total counts to find the pair (could be another set of trips treated as pair)
      const pairValueCandidates = valuesByCount.filter(v => v.count >= 2 && v.numericValue !== tripValue);
      const pairValue = pairValueCandidates[0].numericValue; // Highest remaining pair
      return { rank: 7, name: 'Full House', tieBreaker: [tripValue, pairValue] };
    }

    if (flushSuit) {
      const flushCards = sorted.filter(c => c.suit === flushSuit);
      // Take top 5 cards of the flush suit
      const flushValues = flushCards.slice(0, 5).map(c => c.numericValue);
      return { rank: 6, name: 'Flush', tieBreaker: flushValues };
    }

    const straightHighCard = this.isStraight(sorted);
    if (straightHighCard) {
      return { rank: 5, name: 'Straight', tieBreaker: [straightHighCard] };
    }
    if (this.isThreeOfAKind(sorted)) {
      const tripValue = valuesByCount.find(v => v.count === 3).numericValue;
      const kickers = valuesByCount.filter(v => v.count !== 3).map(v => v.numericValue).slice(0, 2);
      return { rank: 4, name: 'Three of a Kind', tieBreaker: [tripValue, ...kickers] };
    }
    if (this.isTwoPair(sorted)) {
      const pairs = valuesByCount.filter(v => v.count >= 2).map(v => v.numericValue);
      const topPairs = pairs.slice(0, 2);
      const kicker = sorted.find(c => !topPairs.includes(c.numericValue)).numericValue;
      return { rank: 3, name: 'Two Pair', tieBreaker: [...topPairs, kicker] };
    }
    if (this.isOnePair(sorted)) {
      const pairValue = valuesByCount.find(v => v.count === 2).numericValue;
      const kickers = sorted.filter(c => c.numericValue !== pairValue).map(c => c.numericValue).slice(0, 3);
      return { rank: 2, name: 'One Pair', tieBreaker: [pairValue, ...kickers] };
    }
    const highCards = sorted.slice(0, 5).map(c => c.numericValue);
    return { rank: 1, name: 'High Card', tieBreaker: highCards };
  }

  // Helper to get the suit that causes a flush, or null
  getFlushSuit(cards) {
    const suitCounts = {};
    cards.forEach(card => {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    });
    return Object.keys(suitCounts).find(suit => suitCounts[suit] >= 5) || null;
  }

  isRoyalFlush(cards) {
    const flushSuit = this.getFlushSuit(cards);
    if (!flushSuit) return false;

    // Filter to only flush cards
    const flushCards = cards.filter(c => c.suit === flushSuit);
    const values = flushCards.map(c => c.value);
    return values.includes('A') && values.includes('K') && values.includes('Q') &&
      values.includes('J') && values.includes('10');
  }

  isStraightFlush(cards) {
    const flushSuit = this.getFlushSuit(cards);
    if (!flushSuit) return false;

    // Filter to only flush cards BEFORE checking straight
    const flushCards = cards.filter(c => c.suit === flushSuit);
    return this.isStraight(flushCards);
  }

  isFourOfAKind(cards) {
    const valueCounts = this.getValueCounts(cards);
    return Object.values(valueCounts).includes(4);
  }

  isFullHouse(cards) {
    const valueCounts = this.getValueCounts(cards);
    const counts = Object.values(valueCounts).sort((a, b) => b - a);
    return counts[0] === 3 && counts[1] >= 2;
  }

  isFlush(cards) {
    return this.getFlushSuit(cards) !== null;
  }

  isStraight(cards) {
    const uniqueValues = [...new Set(cards.map(c => c.numericValue))].sort((a, b) => b - a);

    // Check for regular straight
    for (let i = 0; i <= uniqueValues.length - 5; i++) {
      if (uniqueValues[i] - uniqueValues[i + 4] === 4) {
        return uniqueValues[i]; // Return high card of the straight
      }
    }

    // Check for A-2-3-4-5 straight (wheel)
    if (uniqueValues.includes(14) && uniqueValues.includes(2) &&
      uniqueValues.includes(3) && uniqueValues.includes(4) && uniqueValues.includes(5)) {
      return 5; // High card is 5 in a wheel
    }

    return false;
  }

  isThreeOfAKind(cards) {
    const valueCounts = this.getValueCounts(cards);
    return Object.values(valueCounts).includes(3);
  }

  isTwoPair(cards) {
    const valueCounts = this.getValueCounts(cards);
    const pairs = Object.values(valueCounts).filter(count => count === 2);
    return pairs.length >= 2;
  }

  isOnePair(cards) {
    const valueCounts = this.getValueCounts(cards);
    return Object.values(valueCounts).includes(2);
  }

  getValueCounts(cards) {
    const counts = {};
    cards.forEach(card => {
      counts[card.value] = (counts[card.value] || 0) + 1;
    });
    return counts;
  }

  determineWinner() {
    this.createSidePots();

    // Default to main pot if side pots logic fails
    if (this.sidePots.length === 0) {
      this.sidePots = [{
        amount: this.pot,
        eligiblePlayers: this.players.filter(p => !p.folded).map(p => p.id)
      }];
    }

    const potResults = [];
    const allWinners = new Set();

    // Evaluate each pot level independently
    for (const pot of this.sidePots) {
      const eligiblePlayers = this.players.filter(p =>
        pot.eligiblePlayers.includes(p.id) && !p.folded
      );

      if (eligiblePlayers.length === 0) continue;

      const playerHands = eligiblePlayers.map(player => ({
        player: player,
        hand: this.evaluateHand(player.hand, this.communityCards)
      }));

      // Sort by rank and tie-breakers
      playerHands.sort((a, b) => {
        if (b.hand.rank !== a.hand.rank) return b.hand.rank - a.hand.rank;
        const aTB = a.hand.tieBreaker || [];
        const bTB = b.hand.tieBreaker || [];
        for (let i = 0; i < Math.max(aTB.length, bTB.length); i++) {
          if ((bTB[i] || 0) !== (aTB[i] || 0)) return (bTB[i] || 0) - (aTB[i] || 0);
        }
        return 0;
      });

      const bestHand = playerHands[0].hand;
      const winners = playerHands.filter(ph => {
        if (ph.hand.rank !== bestHand.rank) return false;
        const phTB = ph.hand.tieBreaker || [];
        const bTB = bestHand.tieBreaker || [];
        for (let i = 0; i < Math.max(phTB.length, bTB.length); i++) {
          if ((phTB[i] || 0) !== (bTB[i] || 0)) return false;
        }
        return true;
      });

      // Distribute chips for THIS pot
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount % winners.length;

      winners.forEach((w, idx) => {
        const amount = share + (idx < remainder ? 1 : 0);
        w.player.chips += amount;
        console.log(`POT AWARDED: ${w.player.name} wins $${amount} from pot of $${pot.amount}`);
        allWinners.add(w.player);
      });

      potResults.push({
        amount: pot.amount,
        winners: winners.map(w => w.player),
        handName: bestHand.name
      });
    }

    // Determine primary winner(s) for UI purposes (those with best hand overall across ALL pots)
    const winningList = [...allWinners].sort((a, b) => {
      const handA = this.evaluateHand(a.hand, this.communityCards);
      const handB = this.evaluateHand(b.hand, this.communityCards);
      if (handB.rank !== handA.rank) return handB.rank - handA.rank;
      const aTB = handA.tieBreaker || [];
      const bTB = handB.tieBreaker || [];
      for (let i = 0; i < Math.max(aTB.length, bTB.length); i++) {
        if ((bTB[i] || 0) !== (aTB[i] || 0)) return (bTB[i] || 0) - (aTB[i] || 0);
      }
      return 0;
    });

    if (winningList.length === 0) {
      console.warn("No winners found in winningList. Pot already distributed?");
      this.eliminateBustedPlayers();
      return [];
    }

    const bestOverallHand = this.evaluateHand(winningList[0].hand, this.communityCards);

    const primaryWinners = winningList.filter(p => {
      const h = this.evaluateHand(p.hand, this.communityCards);
      if (h.rank !== bestOverallHand.rank) return false;
      const hTB = h.tieBreaker || [];
      const bTB = bestOverallHand.tieBreaker || [];
      for (let i = 0; i < Math.max(hTB.length, bTB.length); i++) {
        if ((hTB[i] || 0) !== (bTB[i] || 0)) return false;
      }
      return true;
    });

    // Log the result
    if (this.currentHandLog) {
      this.currentHandLog.winner = primaryWinners.map(w => w.name).join(', ');
      this.currentHandLog.pnl = primaryWinners.some(w => w.isHuman) ? this.pot : -this.pot;
    }

    // Eliminate players with 0 chips
    this.eliminateBustedPlayers();

    return primaryWinners;
  }

  resetBettingRound() {
    this.currentBet = 0;
    this.bettingRound++;
    this.lastBettor = -1;
    this.lastRaiseSize = 0; // Reset for new betting round

    this.players.forEach(player => {
      player.currentBet = 0;
      player.hasActed = false;
    });

    // Action starts with first player after dealer (small blind position), skipping eliminated
    let startIdx = (this.dealerIndex + 1) % this.players.length;
    while (this.players[startIdx].eliminated) {
      startIdx = (startIdx + 1) % this.players.length;
    }
    this.currentPlayerIndex = startIdx;

    // Skip folded or all-in players (with safety check)
    let checks = 0;
    while ((this.players[this.currentPlayerIndex].folded || this.players[this.currentPlayerIndex].isAllIn || this.players[this.currentPlayerIndex].eliminated) && checks < this.players.length) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      checks++;
    }
  }

  playerFold(playerId) {
    const player = this.players[playerId];
    player.folded = true;
    player.hasActed = true;
    player.currentBet = 0; // Clear visible bet on fold
  }

  playerCheck(playerId) {
    const player = this.players[playerId];
    // Can check if currentBet is 0 OR if player already has the current bet matched (the 'option')
    if (this.currentBet === 0 || this.currentBet === player.currentBet) {
      player.hasActed = true;
      return true;
    }
    return false;
  }

  playerCall(playerId) {
    const player = this.players[playerId];
    const callAmount = this.currentBet - player.currentBet;

    // Check if player is going all-in (either forced by short stack or exact amount)
    if (callAmount >= player.chips) {
      return this.playerGoesAllIn(playerId);
    }

    if (player.chips >= callAmount) {
      player.chips -= callAmount;
      player.currentBet += callAmount;
      player.totalChipsBet = (player.totalChipsBet || 0) + callAmount;
      this.pot += callAmount;
      player.hasActed = true;
      return true;
    }
    return false;
  }

  playerBet(playerId, amount) {
    const player = this.players[playerId];

    // Check if player is going all-in
    if (amount >= player.chips) {
      return this.playerGoesAllIn(playerId);
    }

    // Enforce minimum bet (must be at least big blind)
    if (amount < this.bigBlind) {
      return false; // Bet too small
    }

    if (player.chips >= amount && amount > 0) {
      player.chips -= amount;
      player.currentBet += amount;
      player.totalChipsBet = (player.totalChipsBet || 0) + amount;
      this.pot += amount;
      this.currentBet = Math.max(this.currentBet, player.currentBet);
      this.lastBettor = playerId;
      this.lastRaiseSize = amount; // Track for minimum raise
      player.hasActed = true;

      // Reset other players' hasActed status
      this.players.forEach((p, idx) => {
        if (idx !== playerId && !p.folded) {
          p.hasActed = false;
        }
      });
      return true;
    }
    return false;
  }

  playerRaise(playerId, raiseAmount) {
    const player = this.players[playerId];
    const callAmount = this.currentBet - player.currentBet;
    const totalAmount = callAmount + raiseAmount;

    // Check if player is going all-in
    if (totalAmount >= player.chips) {
      return this.playerGoesAllIn(playerId);
    }

    // Enforce minimum raise (must be at least the size of the last raise)
    const minRaise = this.lastRaiseSize || this.bigBlind;
    if (raiseAmount < minRaise) {
      return false; // Raise too small
    }

    if (player.chips >= totalAmount && raiseAmount > 0) {
      player.chips -= totalAmount;
      player.currentBet += totalAmount;
      this.pot += totalAmount;
      this.currentBet = player.currentBet;
      this.lastBettor = playerId;
      this.lastRaiseSize = raiseAmount; // Track for next minimum raise
      player.hasActed = true;

      // Reset other players' hasActed status
      this.players.forEach((p, idx) => {
        if (idx !== playerId && !p.folded) {
          p.hasActed = false;
        }
      });
      return true;
    }
    return false;
  }

  isBettingComplete() {
    const activePlayers = this.players.filter(p => !p.folded && !p.eliminated);

    // SELF-HEALING: Ensure any player with 0 chips is marked All-In
    // This catches edge cases where logic might have missed setting the flag
    activePlayers.forEach(p => {
      if (p.chips === 0 && !p.isAllIn) {
        p.isAllIn = true;
        p.hasActed = true;
      }
    });

    if (activePlayers.length === 1) return true;

    // Betting is complete when all active players have:
    // 1. Acted at least once
    // 2. Matched the current bet (or are all-in)
    // 3. Had a chance to respond to the last raise

    // If no one has acted yet, betting is not complete
    // EXCEPTION: All-In players considered to have acted
    if (activePlayers.some(p => !p.hasActed && !p.isAllIn)) return false;

    // Check if everyone has matched the current bet
    const allMatched = activePlayers.every(p => p.currentBet === this.currentBet || p.chips === 0);

    return allMatched;
  }

  // Handle player going all-in
  playerGoesAllIn(playerId) {
    const player = this.players[playerId];
    const allInAmount = player.chips;

    if (allInAmount === 0) return false;

    player.chips = 0;
    player.currentBet += allInAmount;
    player.totalChipsBet = (player.totalChipsBet || 0) + allInAmount;
    this.pot += allInAmount;
    this.currentBet = Math.max(this.currentBet, player.currentBet);
    this.lastBettor = playerId;
    player.hasActed = true;
    player.isAllIn = true; // Mark player as all-in

    // Reset other players' hasActed status
    this.players.forEach((p, idx) => {
      if (idx !== playerId && !p.folded) {
        p.hasActed = false;
      }
    });

    return true;
  }

  // Create side pots when players go all-in with different amounts
  createSidePots() {
    this.sidePots = [];

    // Get all players who put money in the pot (not folded before betting)
    const playersInHand = this.players.filter(p => (p.totalChipsBet || 0) > 0);

    if (playersInHand.length === 0) return;

    // Sort players by their total bet amount
    const sortedPlayers = [...playersInHand].sort((a, b) => (a.totalChipsBet || 0) - (b.totalChipsBet || 0));

    let previousBet = 0;

    for (let i = 0; i < sortedPlayers.length; i++) {
      const currentBet = sortedPlayers[i].totalChipsBet || 0;
      const betDifference = currentBet - previousBet;

      if (betDifference > 0) {
        // Calculate pot amount for this level
        const eligiblePlayers = sortedPlayers.slice(i);
        const potAmount = betDifference * eligiblePlayers.length;

        this.sidePots.push({
          amount: potAmount,
          eligiblePlayers: eligiblePlayers.map(p => p.id)
        });
      }

      previousBet = currentBet;
    }
  }

  simulateAIAction(playerId) {
    try {
      const player = this.players[playerId];
      if (player.folded || player.isHuman || player.isAllIn) return;

      // Recalculate hand strength
      const handStrength = this.evaluateHandStrength(player.hand, this.communityCards);
      const position = this.getPlayerPosition(playerId);
      const callAmount = this.currentBet - player.currentBet;
      const potOdds = this.calculatePotOdds(callAmount);

      // Personality Stats
      const { tightness, aggression, bluffFrequency, archetype } = player;

      console.log(`AI Acting: ${player.name} (${archetype}) | Str: ${handStrength.toFixed(2)} | Call: $${callAmount}`);

      // 1. ADJUST STRENGTH PER POSITION
      let adjustedStrength = handStrength;
      if (position === 'late') adjustedStrength += 0.05;
      if (position === 'early') adjustedStrength -= 0.05;

      // 2. DECIDE IF BLUFFING
      const activeOpponents = this.players.filter(p => !p.folded && p.id !== playerId).length;
      let isBluffing = false;
      if (activeOpponents <= 3 && Math.random() < bluffFrequency && adjustedStrength < 0.5) {
        isBluffing = true;
      }

      // 3. DETERMINE ACTION
      if (archetype === 'station' && callAmount > 0 && adjustedStrength > 0.2) {
        this.performAction(playerId, 'call');
        return;
      }

      if (archetype === 'maniac' && isBluffing) {
        if (this.performAction(playerId, 'raise', this.pot * 1.5)) return;
      }

      const playThreshold = tightness * 0.6;

      if (this.currentBet > 0) {
        if (adjustedStrength > playThreshold + 0.2) {
          if (Math.random() < aggression) this.performAction(playerId, 'raise');
          else this.performAction(playerId, 'call');
        } else if (adjustedStrength > playThreshold || potOdds < 0.2) {
          this.performAction(playerId, 'call');
        } else {
          if (isBluffing && Math.random() < aggression) this.performAction(playerId, 'raise');
          else this.performAction(playerId, 'fold');
        }
      } else {
        if (adjustedStrength > playThreshold) {
          if (Math.random() < aggression) this.performAction(playerId, 'bet');
          else this.performAction(playerId, 'check');
        } else {
          if (isBluffing) this.performAction(playerId, 'bet');
          else this.performAction(playerId, 'check');
        }
      }
    } catch (err) {
      console.error(`CRITICAL AI ERROR for player ${playerId}:`, err);
      // Failsafe: Always check if possible to unblock
      try {
        if (this.currentBet === 0 || this.players[playerId].currentBet === this.currentBet) {
          this.playerCheck(playerId);
        } else {
          this.playerFold(playerId);
        }
      } catch (e) {
        this.players[playerId].hasActed = true; // Absolute last resort
      }
    }
  }

  // Helper to execute actions and play sounds
  performAction(playerId, actionType, amountOverride = null) {
    const player = this.players[playerId];
    const callAmount = this.currentBet - player.currentBet;
    let result = false;
    let actualAmount = 0;

    switch (actionType) {
      case 'fold':
        this.playerFold(playerId);
        if (window.soundManager) window.soundManager.playFold();
        result = true;
        break;
      case 'check':
        result = this.playerCheck(playerId);
        if (result && window.soundManager) window.soundManager.playCheck();
        break;
      case 'call':
        actualAmount = callAmount;
        result = this.playerCall(playerId);
        if (result && window.soundManager) window.soundManager.playChipSound();
        break;
      case 'bet':
        const betAmount = amountOverride || Math.max(this.bigBlind, Math.floor(this.pot * 0.6));
        const finalBet = Math.min(betAmount, player.chips);
        actualAmount = finalBet;
        if (this.playerBet(playerId, finalBet)) {
          if (window.soundManager) window.soundManager.playChipSound();
          result = true;
        } else {
          // Fallback
          this.playerCheck(playerId);
          if (window.soundManager) window.soundManager.playCheck();
          actionType = 'check'; // Correct the action for callback
          result = true;
        }
        break;
      case 'raise':
        const raiseAmt = amountOverride || Math.max(this.lastRaiseSize || this.bigBlind, Math.floor(this.pot * 0.7));
        const finalRaise = Math.min(raiseAmt, player.chips - callAmount);
        actualAmount = finalRaise;
        if (this.playerRaise(playerId, finalRaise)) {
          if (window.soundManager) window.soundManager.playRaise();
          result = true;
        } else {
          // Fallback to call
          actionType = 'call';
          actualAmount = callAmount;
          result = this.playerCall(playerId);
          if (result && window.soundManager) window.soundManager.playChipSound();

          // Absolute fallback if call also failed (should be impossible but let's be safe)
          if (!result) {
            this.playerFold(playerId);
            actionType = 'fold';
            if (window.soundManager) window.soundManager.playFold();
            result = true;
          }
        }
        break;
    }

    if (result && this.onAction) {
      this.onAction(playerId, actionType, actualAmount);
    }
    return result;
  }

  // Helper function to determine player position
  getPlayerPosition(playerId) {
    const activePlayers = this.players.filter(p => !p.folded && p.chips > 0).length;
    const smallBlindIndex = (this.dealerIndex + 1) % this.players.length;
    const bigBlindIndex = (this.dealerIndex + 2) % this.players.length;

    // Calculate position relative to dealer
    let positionFromDealer = (playerId - this.dealerIndex + this.players.length) % this.players.length;

    // Early position: first 3 after big blind
    if (positionFromDealer >= 3 && positionFromDealer <= 5) return 'early';
    // Middle position: next 3
    if (positionFromDealer >= 6 && positionFromDealer <= 7) return 'middle';
    // Late position: button and cutoff
    return 'late';
  }

  // Calculate pot odds
  calculatePotOdds(callAmount) {
    if (callAmount === 0) return 1; // No cost to continue
    return callAmount / (this.pot + callAmount);
  }

  // Evaluate pre-flop hand strength with proper rankings
  evaluatePreFlopHand(hand) {
    if (hand.length < 2) return 0.3;

    const card1 = hand[0];
    const card2 = hand[1];
    const val1 = card1.numericValue;
    const val2 = card2.numericValue;
    const highCard = Math.max(val1, val2);
    const lowCard = Math.min(val1, val2);
    const isPair = val1 === val2;
    const isSuited = card1.suit === card2.suit;
    const gap = highCard - lowCard;

    // Premium pairs
    if (isPair && highCard >= 12) return 0.95; // QQ, KK, AA
    if (isPair && highCard >= 10) return 0.85; // TT, JJ
    if (isPair && highCard >= 7) return 0.70;  // 77, 88, 99
    if (isPair) return 0.60; // Low pairs

    // High cards
    if (highCard === 14 && lowCard >= 12) return isSuited ? 0.88 : 0.82; // AK, AQ
    if (highCard === 14 && lowCard >= 10) return isSuited ? 0.75 : 0.68; // AJ, AT
    if (highCard === 13 && lowCard >= 11) return isSuited ? 0.78 : 0.72; // KQ, KJ

    // Suited connectors and one-gappers
    if (isSuited && gap <= 1 && highCard >= 8) return 0.65;
    if (isSuited && gap <= 2 && highCard >= 9) return 0.60;

    // Medium suited cards
    if (isSuited && highCard >= 10) return 0.55;

    // Offsuit connectors
    if (gap <= 1 && highCard >= 9) return 0.50;

    // High card with weak kicker
    if (highCard >= 12) return 0.45;
    if (highCard >= 10) return 0.40;

    // Trash hands
    return 0.25;
  }

  evaluateHandStrength(hand, communityCards) {
    if (communityCards.length === 0) {
      // Pre-flop: use improved hand evaluation
      return this.evaluatePreFlopHand(hand);
    }

    const handEval = this.evaluateHand(hand, communityCards);
    return handEval.rank / 10; // Normalize to 0-1
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  advanceToNextPlayer() {
    let checks = 0;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      checks++;
      if (checks > this.players.length) {
        break;
      }
    } while (this.players[this.currentPlayerIndex].folded || this.players[this.currentPlayerIndex].isAllIn || this.players[this.currentPlayerIndex].eliminated);
  }

  // Learning Features Methods

  // Removed duplicate advanceToNextPlayer method

  // Check if only one player remains and award them the pot
  checkForSinglePlayer() {
    const activePlayers = this.players.filter(p => !p.folded);

    if (activePlayers.length === 1) {
      // Only one player left - they win by default
      const winner = activePlayers[0];
      const winAmount = this.pot;
      winner.chips += winAmount;
      this.pot = 0; // Atomic reset to prevent double awarding
      console.log(`SINGLE PLAYER WIN: ${winner.name} wins $${winAmount} by default`);

      // Set game to showdown state to trigger winner display
      this.gamePhase = 'showdown';
      this.singlePlayerWin = true;
      this.singleWinner = winner;

      return true;
    }

    return false;
  }

  // Get player position relative to dealer (early, middle, late)
  getPlayerPosition(playerId) {
    const numPlayers = this.players.length;
    const dealerPos = this.dealerIndex;
    const playerPos = this.players.findIndex(p => p.id === playerId);

    if (playerPos === -1) return 'unknown';

    // Calculate position relative to dealer
    let relativePos = (playerPos - dealerPos + numPlayers) % numPlayers;

    // Early position: 1-3 seats after dealer (SB, BB, UTG)
    if (relativePos >= 1 && relativePos <= 3) {
      return 'early';
    }
    // Late position: dealer and 2 seats before dealer (cutoff, button)
    else if (relativePos === 0 || relativePos >= numPlayers - 2) {
      return 'late';
    }
    // Middle position: everything else
    else {
      return 'middle';
    }
  }

  // Update equity for all active players
  updatePlayerEquity() {
    if (!this.learningEngine || this.communityCards.length === 0) return;

    const activePlayers = this.players.filter(p => !p.folded);
    const numOpponents = activePlayers.length - 1;

    activePlayers.forEach(player => {
      if (player.hand.length === 2) {
        const equityData = this.learningEngine.calculateEquity(
          player.hand,
          this.communityCards,
          numOpponents,
          500 // iterations
        );
        player.equity = equityData.equity;
        player.winProbability = equityData.winRate;
      }
    });
  }

  // Get optimal action recommendation for human player
  getOptimalActionForPlayer() {
    if (!this.learningEngine) return null;

    const player = this.players[0]; // Human player is always at index 0
    if (!player || player.folded || player.hand.length !== 2) return null;

    const position = this.getPlayerPosition(0);
    const activePlayers = this.players.filter(p => !p.folded);
    const numOpponents = activePlayers.length - 1;

    const rec = this.learningEngine.getOptimalAction(
      player.hand,
      this.communityCards,
      this.pot,
      this.currentBet,
      player.currentBet,
      player.chips,
      position,
      numOpponents
    );

    // Add explanation
    const callAmount = this.currentBet - player.currentBet;
    try {
      rec.explanation = this.learningEngine.generateExplanation(
        rec,
        player.hand,
        this.communityCards,
        this.pot,
        callAmount,
        position
      );
    } catch (e) {
      console.error("Coach Explanation Error:", e);
      rec.explanation = "GTO analysis favors this move based on current pot odds and equity.";
    }

    return rec;
  }

  initializeLearningEngine() {
    if (typeof LearningEngine !== 'undefined') {
      this.learningEngine = new LearningEngine(this);
    }
    if (typeof RangeCalculator !== 'undefined') {
      this.rangeCalculator = new RangeCalculator();
    }
  }

  logAction(playerId, action, amount = 0, stage = null) {
    if (!this.currentHandLog) return;

    const player = this.players[playerId];
    const logEntry = {
      stage: stage || this.gamePhase,
      actor: player.name,
      isHuman: player.isHuman,
      action: action,
      amount: amount,
      potSize: this.pot
    };

    this.currentHandLog.actions.push(logEntry);

    // Update community cards reference often
    this.currentHandLog.communityCards = [...this.communityCards];

    // If human, update hole cards
    if (player.isHuman && this.currentHandLog.holeCards.length === 0) {
      this.currentHandLog.holeCards = player.hand.map(c => c.value + c.suit);
    }

    // Update Range Calculator if it's an opponent action
    if (!player.isHuman && this.rangeCalculator) {
      this.rangeCalculator.applyAction(action, stage);
    }

    this.updateUserStats(playerId, action, stage);
  }

  updateUserStats(playerId, action, stage) {
    if (playerId !== 0) return; // Only track human (ID 0)

    // VPIP: Voluntarily Put Money In Pot (Call or Raise/Bet) Preflop
    if (stage === 'preflop') {
      if ((action === 'call' || action === 'bet' || action === 'raise') && !this.currentHandLog.vpipTracked) {
        this.userStats.vpipCount++;
        this.currentHandLog.vpipTracked = true;
      }
      // PFR: Preflop Raise (Raise/Bet)
      if ((action === 'bet' || action === 'raise') && !this.currentHandLog.pfrTracked) {
        this.userStats.pfrCount++;
        this.currentHandLog.pfrTracked = true;
      }
    }

    // Aggression (Postflop)
    if (stage !== 'preflop' && stage !== 'waiting') {
      if (action === 'bet' || action === 'raise') {
        this.userStats.aggressionCount++;
      } else if (action === 'call') {
        this.userStats.passiveCount++;
      }
    }
  }

  // SCENARIO MODE LOGIC
  startScenario(type) {
    this.startNewHand();
    this.currentHandLog.isScenario = true;
    this.currentHandLog.scenarioType = type;

    const human = this.players[0];
    const villain = this.players[this.players.length - 1]; // Use last player as villain usually

    if (type === 'river_call') {
      // Scenario: River Bluff Catch
      // Board: Ks 8h 2c 9d Qh (Scary board, straight possible)
      // Hero: Kc Th (Top Pair)
      // Pot: Big. Villain Jams.

      this.gamePhase = 'river';
      this.communityCards = [
        { value: 'K', suit: '♠', numericValue: 13, color: 'black' },
        { value: '8', suit: '♥', numericValue: 8, color: 'red' },
        { value: '2', suit: '♣', numericValue: 2, color: 'black' },
        { value: '9', suit: '♦', numericValue: 9, color: 'red' },
        { value: 'Q', suit: '♥', numericValue: 12, color: 'red' }
      ];

      // Hero Hand
      human.hand = [
        { value: 'K', suit: '♣', numericValue: 13, color: 'black' },
        { value: '10', suit: '♥', numericValue: 10, color: 'red' }
      ];

      // Villain Hand (Bluff - missed straight)
      villain.hand = [
        { value: 'J', suit: '♠', numericValue: 11, color: 'black' },
        { value: '10', suit: '♠', numericValue: 10, color: 'black' }
      ];

      this.pot = 300;
      this.currentBet = 0;

      // Force Villain Bet
      villain.chips = 1000;
      this.playerBet(villain.id, 500); // Massive overbet bluff
      this.currentPlayerIndex = 0; // Action on user
    }
    else if (type === 'flush_draw') {
      // Scenario: Flop Flush Draw - Chasing
      // Board: Ah 9h 4s
      // Hero: Kh 3h (King High Flush Draw)
      // Villain Bets pot.

      this.gamePhase = 'flop';
      this.communityCards = [
        { value: 'A', suit: '♥', numericValue: 14, color: 'red' },
        { value: '9', suit: '♥', numericValue: 9, color: 'red' },
        { value: '4', suit: '♠', numericValue: 4, color: 'black' }
      ];

      human.hand = [
        { value: 'K', suit: '♥', numericValue: 13, color: 'red' },
        { value: '3', suit: '♥', numericValue: 3, color: 'red' }
      ];

      villain.hand = [
        { value: 'A', suit: '♣', numericValue: 14, color: 'black' },
        { value: 'Q', suit: '♦', numericValue: 12, color: 'red' }
      ];

      this.pot = 100;
      villain.chips = 1000;
      this.playerBet(villain.id, 100); // Pot sized bet
      this.currentPlayerIndex = 0;
    }
  }

  // Deprecated old method, replacing with logAction
  recordDecision(playerId, action, amount = 0) {
    this.logAction(playerId, action, amount);
  }

  // Additional helper methods can be added here
}

// Bankroll Manager Class
class BankrollManager {
  constructor() {
    this.STORAGE_KEY = 'qpoker_career_data';
    this.loadData();
  }

  loadData() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      this.data = JSON.parse(stored);
    } else {
      // New Career
      this.data = {
        bankroll: 50, // Starting Bankroll (Micro stakes)
        handsPlayed: 0,
        level: 1, // 1=Micro, 2=Low, 3=Mid, 4=High, 5=Pro
        totalWinnings: 0
      };
      this.saveData();
    }
  }

  saveData() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
  }

  // Attempt to buy in for 'amount'
  // Returns true if successful, false if insufficient funds
  buyIn(amount) {
    // For gameplay flow, if bankroll < 1000 (standard buyin), we might allow a partial buyin
    // Or if bankroll is super low (<$10), we reset (Bankruptcy protection)

    if (this.data.bankroll < 10) {
      // Bankruptcy! Reset to 50
      this.data.bankroll = 50;
      console.log("Bankruptcy Reset!");
    }

    // In the game, chips are abstract. But let's say 1 Game Chip = $0.01 real dollar for Level 1
    // To simplify: The Game uses "Chips" (1000 start). The Bankroll is in "$".
    // Level 1: $10 buyin = 1000 Chips. (1 chip = $0.01)

    const buyInCost = this.getLevelBuyIn();

    if (this.data.bankroll >= buyInCost) {
      this.data.bankroll -= buyInCost;
      this.saveData();
      return true;
    } else {
      return false;
    }
  }

  cashOut(chipAmount) {
    // Convert Chips back to $
    // Level 1: 1000 chips = $10. Ratio = 0.01
    const ratio = this.getLevelRatio();
    const cashValue = chipAmount * ratio;

    this.data.bankroll += cashValue;
    this.data.totalWinnings += (cashValue - this.getLevelBuyIn()); // Approx net
    this.saveData();
  }

  getLevelBuyIn() {
    // Level 1: $10
    // Level 2: $50
    // Level 3: $200
    const levels = { 1: 10, 2: 50, 3: 200, 4: 1000, 5: 5000 };
    return levels[this.data.level] || 10;
  }

  getLevelRatio() {
    // Buyin $10 -> 1000 chips. Ratio = 0.01
    return this.getLevelBuyIn() / 1000;
  }

  getBankroll() {
    return this.data.bankroll;
  }
}

// Export for use in HTML
window.PokerGame = PokerGame;
window.BankrollManager = BankrollManager;
