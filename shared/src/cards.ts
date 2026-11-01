import type { DeckDef, DeckId } from './types.ts';

export const DECKS: Record<DeckId, DeckDef> = {
  wildcard: {
    name: 'Wildcard',
    cards: [
      { title: 'Main Character Energy', text: 'Your financial comeback starts now. Probably.', action: 'Advance to Start and collect your salary.', effect: { type: 'moveTo', target: 'start' } },
      { title: 'Another Coalition Meeting', text: 'Bibi wants to renegotiate. You already pressed Accept.', action: 'Advance to Jerusalem.', effect: { type: 'advanceTo', space: 'Jerusalem' } },
      { title: 'Make Luggage Expensive Again', text: 'Trump has put a tariff on your suitcase.', action: 'Pay $100.', effect: { type: 'money', amount: -100 } },
      { title: 'Ribbon-Cutting Any%', text: 'Modi is inaugurating your new house. Bring scissors.', action: 'Advance to Delhi.', effect: { type: 'advanceTo', space: 'Delhi' } },
      { title: 'The Long Table', text: 'Putin has invited you to an extremely normal meeting.', action: 'Go directly to the Visa Office. Do not collect salary.', effect: { type: 'goToJail' } },
      { title: 'Bengaluru Traffic', text: 'Your driver says “two minutes.”', action: 'Move back 3 spaces.', effect: { type: 'moveBy', steps: -3 } },
      { title: 'Boris Was Navigating', text: 'The itinerary was apparently only a suggestion.', action: 'Advance to London.', effect: { type: 'advanceTo', space: 'London' } },
      { title: 'Training Arc Complete', text: 'You are now legally required to have an anime opening.', action: 'Advance to Tokyo.', effect: { type: 'advanceTo', space: 'Tokyo' } },
      { title: 'Gate Changed. Again.', text: 'You have seven minutes and the airport is seven kilometres long.', action: 'Advance to the nearest airport. Pay double rent if owned.', effect: { type: 'moveTo', target: 'nearestTransit', transitMultiplier: 2 } },
      { title: 'Connected, No Internet', text: 'The hotel Wi-Fi has accepted your payment and rejected your existence.', action: 'Advance to the nearest utility. If owned, roll two dice and pay 10× the total.', effect: { type: 'moveTo', target: 'nearestUtility', utilityDice: 10 } },
      { title: 'Factory Inspection', text: 'Xi would like to see your production numbers. You manufacture excuses.', action: 'Advance to Shenzhen.', effect: { type: 'advanceTo', space: 'Shenzhen' } },
      { title: 'New York State of Debt', text: 'Your landlord has discovered a new fee.', action: 'Advance to New York.', effect: { type: 'advanceTo', space: 'New York' } },
      { title: 'Rome Wasn’t Repaired in a Day', text: 'The contractor has discovered “historical complications.”', action: 'Pay $25 per house and $100 per hotel.', effect: { type: 'repairs', perHouse: 25, perHotel: 100 } },
      { title: 'Pizza Tribunal', text: 'You requested pineapple in Naples. The hearing was brief.', action: 'Pay $50.', effect: { type: 'money', amount: -50 } },
      { title: 'You Won an Argument Online', text: 'Nobody changed their mind, but your sponsor is delighted.', action: 'Collect $50.', effect: { type: 'money', amount: 50 } },
      { title: 'Diplomatic Immunity-ish', text: 'The stamp looks convincing enough.', action: 'Leave the Visa Office free. Keep this card until used.', effect: { type: 'jailCard' } }
    ]
  },
  dispatch: {
    name: 'Treasure',
    cards: [
      { title: 'Insurance Actually Paid', text: 'Please sit down before reading the amount.', action: 'Collect $200.', effect: { type: 'money', amount: 200 } },
      { title: 'Mumbai Reel Goes Viral', text: 'Apparently filming traffic counts as a documentary.', action: 'Collect $100.', effect: { type: 'money', amount: 100 } },
      { title: 'Nice Investment', text: 'You bought property in Nice. Everyone made the same joke.', action: 'Collect $50.', effect: { type: 'money', amount: 50 } },
      { title: 'Coalition Stability Bonus', text: 'Bibi’s coalition survived an entire turn. Frame the certificate.', action: 'Collect $75.', effect: { type: 'money', amount: 75 } },
      { title: 'Kyoto Souvenir Empire', text: 'Your fridge magnets are outperforming your investments.', action: 'Collect $100.', effect: { type: 'money', amount: 100 } },
      { title: 'Grandma’s Emergency Fund', text: 'She thinks you are too thin and financially irresponsible.', action: 'Collect $100.', effect: { type: 'money', amount: 100 } },
      { title: 'Tax Refund', text: 'The government insists this was your money all along.', action: 'Collect $100.', effect: { type: 'money', amount: 100 } },
      { title: 'Branding Opportunity', text: 'Trump has renamed your hotel after himself. The new sign is enormous.', action: 'Pay $100.', effect: { type: 'money', amount: -100 } },
      { title: 'Paris Apartment Reveal', text: 'The advertised Eiffel Tower view was a television.', action: 'Pay $100.', effect: { type: 'money', amount: -100 } },
      { title: 'London Luxury Living', text: 'Your apartment has been reclassified as a shoe cupboard.', action: 'Pay $50.', effect: { type: 'money', amount: -50 } },
      { title: 'Universal Adapter', text: 'Compatible with every socket except the one in your room.', action: 'Pay $50.', effect: { type: 'money', amount: -50 } },
      { title: 'Macron’s Rent Reform', text: 'Your landlord assures you the increase is essential.', action: 'Pay $75.', effect: { type: 'money', amount: -75 } },
      { title: 'Birthday Abroad', text: 'Nobody brought a present. You accept bank transfers.', action: 'Collect $10 from every other player.', effect: { type: 'collectEach', amount: 10 } },
      { title: '“We’ll Split It Equally.”', text: 'You ordered water. Everyone else ordered lobster.', action: 'Pay $25 to every other player.', effect: { type: 'payEach', amount: 25 } },
      { title: 'Landlord Maintenance Day', text: 'Everything broke immediately after the warranty expired.', action: 'Pay $25 per house and $100 per hotel.', effect: { type: 'repairs', perHouse: 25, perHotel: 100 } },
      { title: 'Paperwork Disappeared', text: 'The Visa Office cannot find your file and would rather you leave.', action: 'Leave the Visa Office free. Keep this card until used.', effect: { type: 'jailCard' } }
    ]
  }
};
