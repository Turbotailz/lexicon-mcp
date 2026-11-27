import { apiPost } from "../client.js";
import type { LexiconResponse } from "../types.js";

/**
 * `action` stays a free string so control actions added after this build keep working.
 * Ghost Curator actions arrived in Lexicon v1.12.4.
 */
export const controlToolDescription = `Run a Lexicon control action (POST /v1/control). Requires LEXICON_MCP_ALLOW_WRITES=1.

\`action\` is any control action name, including actions added in later Lexicon versions. Lexicon rejects an unknown action with error code 5. An action that needs a selection or a loaded track does nothing and still returns 200.

Examples: Incoming_SelectedDone, Application_SetRating (parameters.amount 0-5), Application_Tags_AddShortcut (parameters.amount 1-20), MusicPlayer_Load (parameters.id), AudioAnalyzer_Analyze (parameters.trackIds).

Ghost Curator (Lexicon v1.12.4). A name ending in a number is a shortcut for the same action with that parameter: GhostCurator_SelectDeck1 selects deck 1, GhostCurator_SetMinRating0 turns the rating rule off, GhostCurator_SetEnergyDirection_Up sets direction Up.
- GhostCurator_ToggleFollow, GhostCurator_ToggleOverlay, GhostCurator_RollDice — no parameters
- GhostCurator_UseSuggestion1, GhostCurator_UseSuggestion2, GhostCurator_UseSuggestion3
- GhostCurator_SelectDeck — parameters.deckNumber, the deck number in the DJ app or player starting at 1. Nothing happens when that deck is not followed
- GhostCurator_SelectDeck1, GhostCurator_SelectDeck2, GhostCurator_SelectDeck3, GhostCurator_SelectDeck4
- GhostCurator_NextDeck, GhostCurator_PreviousDeck — select the next or previous deck, wrapping around
- GhostCurator_SetEnergyDirection — parameters.direction: Any, Up, Flat, or Down
- GhostCurator_SetEnergyDirection_Up, GhostCurator_SetEnergyDirection_Flat, GhostCurator_SetEnergyDirection_Down, GhostCurator_SetEnergyDirection_Any
- GhostCurator_SetMinRating — parameters.amount from 0 to 5, where 0 switches the rating rule off
- GhostCurator_SetMinRating0, GhostCurator_SetMinRating1, GhostCurator_SetMinRating2, GhostCurator_SetMinRating3, GhostCurator_SetMinRating4, GhostCurator_SetMinRating5
- GhostCurator_SwitchMode — optional parameters.mode: manual (My rules) or crowd (DJ picks). Omit mode to switch to the other one. DJ picks asks to share your library first if you have not
- GhostCurator_ToggleQuickTag — parameters.tagId, the tag ID
- GhostCurator_LoadSuggestion — parameters.index (starting at 0) and parameters.deckNumber (the deck number, starting at 1)`;

export async function runControl(
  action: string,
  parameters?: Record<string, unknown>,
): Promise<LexiconResponse<unknown>> {
  const body: Record<string, unknown> = { action };
  if (parameters !== undefined) body.parameters = parameters;
  return apiPost("/v1/control", body);
}
