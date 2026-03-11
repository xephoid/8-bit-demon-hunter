/**
 * Shared How To Play HTML content.
 * Used by the start screen and the pause screen.
 */
export const HOW_TO_HTML = `
<div style="color:#FFD700;font-size:13px;margin-bottom:8px;">OBJECTIVE</div>
<div style="margin-bottom:24px;">Find the demon hiding among the townspeople and defeat it.</div>

<div style="color:#FFD700;font-size:13px;margin-bottom:8px;">CONTROLS</div>
<table style="border-collapse:collapse;margin-bottom:24px;width:100%;">
  <tr><td style="padding:5px 20px 5px 0;color:#aaa;white-space:nowrap;">Mouse</td><td>Look around</td></tr>
  <tr><td style="padding:5px 20px 5px 0;color:#aaa;white-space:nowrap;">Left Click</td><td>Attack</td></tr>
  <tr><td style="padding:5px 20px 5px 0;color:#aaa;white-space:nowrap;">WASD</td><td>Move</td></tr>
  <tr><td style="padding:5px 20px 5px 0;color:#aaa;white-space:nowrap;">E</td><td>Interact / dismiss dialogue</td></tr>
  <tr><td style="padding:5px 20px 5px 0;color:#aaa;white-space:nowrap;">C</td><td>Open Clue Book</td></tr>
  <tr><td style="padding:5px 20px 5px 0;color:#aaa;white-space:nowrap;">F</td><td>Level Up (when available)</td></tr>
  <tr><td style="padding:5px 20px 5px 0;color:#aaa;white-space:nowrap;">Esc</td><td>Pause</td></tr>
</table>

<div style="color:#FFD700;font-size:13px;margin-bottom:8px;">CLUES</div>
<div style="margin-bottom:6px;">People give you clues about the demon. Those who say they know the truth have the best clues and are never lying.</div>
<div style="margin-bottom:6px;">The demon and its minions always lie &#x2014; their clues contradict the truth.</div>
<div style="margin-bottom:24px;">Complete a person&#x2019;s task to earn their good clue or special ability.</div>

<div style="color:#FFD700;font-size:13px;margin-bottom:8px;">PEOPLE</div>
<div style="margin-bottom:6px;">&#x2022; Location &#x2014; Always 10 people per town.</div>
<div style="margin-bottom:6px;">&#x2022; Occupation &#x2014; Each town has one of each. Ten total.</div>
<div style="margin-bottom:6px;">&#x2022; Favorite Color &#x2014; Multiple people have the same favorite color. Only 6 possible.</div>
<div style="margin-bottom:6px;">&#x2022; Pet &#x2014; Multiple people can have the same pet. 15 possible pets.</div>
<div style="margin-bottom:24px;">&#x2022; Item &#x2014; Unique to each person.</div>

<div style="color:#FFD700;font-size:13px;margin-bottom:8px;">LEVELING</div>
<div style="margin-bottom:6px;">Kill enemies to earn XP. Level up to improve:</div>
<div style="margin-bottom:24px;color:#aaa;">Strength (damage) &middot; Agility (speed) &middot; Health (hearts) &middot; Range (attack range)</div>

<div style="color:#FFD700;font-size:13px;margin-bottom:8px;">ACCUSATION</div>
<div style="margin-bottom:24px;">Open the Clue Book (C), find the demon, and click ACCUSE.<br>If you&#x2019;re right &#x2014; you reach the finale. If you&#x2019;re wrong &#x2014; game over.</div>

<div style="color:#FFD700;font-size:13px;margin-bottom:8px;">CREDITS</div>
<div style="margin-bottom:6px;">Created by Zeke Swepson</div>
<div style="margin-bottom:6px;">Much code written by Claude Code</div>
<div style="margin-bottom:6px;">Open source sound and art downloaded from OpenGameArt.org</div>

`.trim();
