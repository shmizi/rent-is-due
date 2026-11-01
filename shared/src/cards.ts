import type { DeckDef, DeckId } from './types.ts';

export const DECKS: Record<DeckId, DeckDef> = {
  dispatch: {
    name: 'Dispatch',
    cards: [
      { text: 'Ferry fare refund. Collect $40.', effect: { type: 'money', amount: 40 } },
      { text: 'You won the harbor festival raffle. Collect $100.', effect: { type: 'money', amount: 100 } },
      { text: 'Boat repairs. Pay $50.', effect: { type: 'money', amount: -50 } },
      { text: 'You found a lost wallet on the pier and got a reward. Collect $20.', effect: { type: 'money', amount: 20 } },
      { text: 'Dock inspection fine. Pay $80.', effect: { type: 'money', amount: -80 } },
      { text: 'It is your birthday at the pier. Collect $15 from every player.', effect: { type: 'collectEach', amount: 15 } },
      { text: 'You bought a round at the Lantern. Pay every player $20.', effect: { type: 'payEach', amount: 20 } },
      { text: 'Storm damage. Pay $30 for each house and $100 for each hotel.', effect: { type: 'repairs', perHouse: 30, perHotel: 100 } },
      { text: 'Out of Lockup free. Keep this card until you need it.', effect: { type: 'jailCard' } },
      { text: 'Caught smuggling. Go straight to Lockup.', effect: { type: 'goToJail' } },
      { text: 'The tide carries you to Start. Collect your salary.', effect: { type: 'moveTo', target: 'start' } },
      { text: 'Fish market windfall. Collect $150.', effect: { type: 'money', amount: 150 } },
      { text: 'Sailing lessons. Pay $40.', effect: { type: 'money', amount: -40 } },
      { text: 'Tax rebate. Collect $60.', effect: { type: 'money', amount: 60 } },
      { text: 'Harbor pilot fee. Pay $25.', effect: { type: 'money', amount: -25 } },
      { text: 'You sold your old dinghy. Collect $50.', effect: { type: 'money', amount: 50 } }
    ]
  },
  wildcard: {
    name: 'Wildcard',
    cards: [
      { text: 'Catch the next ferry. If someone owns it, pay them double rent.', effect: { type: 'moveTo', target: 'nearestTransit', transitMultiplier: 2 } },
      { text: 'Catch the next ferry. If someone owns it, pay them double rent.', effect: { type: 'moveTo', target: 'nearestTransit', transitMultiplier: 2 } },
      { text: 'Go to the nearest utility. If someone owns it, pay them 10 times your roll.', effect: { type: 'moveTo', target: 'nearestUtility', utilityDice: 10 } },
      { text: 'Head back to Start. Collect your salary.', effect: { type: 'moveTo', target: 'start' } },
      { text: 'Take a stroll to the most expensive street on the board.', effect: { type: 'moveTo', target: 'priciestStreet' } },
      { text: 'Walk back three spaces.', effect: { type: 'moveBy', steps: -3 } },
      { text: 'Out of Lockup free. Keep this card until you need it.', effect: { type: 'jailCard' } },
      { text: 'Busted on the boardwalk. Go straight to Lockup.', effect: { type: 'goToJail' } },
      { text: 'Speeding on the coast road. Pay $15.', effect: { type: 'money', amount: -15 } },
      { text: 'Your shares paid out. Collect $50.', effect: { type: 'money', amount: 50 } },
      { text: 'You were elected harbor master. Pay every player $50.', effect: { type: 'payEach', amount: 50 } },
      { text: 'Building inspection. Pay $25 for each house and $100 for each hotel.', effect: { type: 'repairs', perHouse: 25, perHotel: 100 } },
      { text: 'Lucky scratch card. Collect $150.', effect: { type: 'money', amount: 150 } },
      { text: 'Go to the cheapest street on the board.', effect: { type: 'moveTo', target: 'cheapestStreet' } },
      { text: 'Hop on a water taxi to a random street.', effect: { type: 'moveTo', target: 'randomStreet' } },
      { text: 'Your savings bond matured. Collect $100.', effect: { type: 'money', amount: 100 } }
    ]
  }
};
