Mini Burger


Objective:
Find the demon and accuse them.

People all have 5 attributes:
- Location (town) - What town they are in. There are always 10 people per town.
- Favorite color - Multiple people can have the same favorite color, but there are only 6 possible colors
- Pet - Multiple people can have the same pet. There are 15 possible pets
- Occupation - Only one per town (There is always one of each occupation in a town). Mayor, Barber, Soldier, Musician, Farmer, Blacksmith, Merchant, Tailor, Baker, Carpenter.
- Item - Only one per person. No person has the same item.

People give clues about who the demon is. People who "know the truth" have the best clues and are never lying. The demon has minions. The demon and its minions will always lie. Their clue will contradict the truth.

Keys:
Mouse - Look around
Left Click - Attack
WASD - Move
E - Interact (enter town or talk to person)
C - Open Clue Book
F - Level up (if available)
Esc - Pause

Clue examples:

Good clues (only 5):
- The demon is in this location
- The demon has a lizard as a pet
- The demon is a Carpenter
- The demon likes the color red
- The demon has a hammer

Bad clues (all other clues):
- The demon is not a Carpenter
- The demon does not have a fish as a pet
- The demon does not like the color red
- The demon does not have a wrench
- The demon is not in this location
- The demon is to the [cardinal direction] of [location]

The demon's clue is a lie. It contradicts other clues. The demon alwasy gives a bad clue that is wrong.

To get a good clue you must do a favor for the person. Favors are tasks the player can do. Examples tasks:
- Kill X number of monsters (One per monster type available in the world)
- Get an item from a person and bring it to them
- Escort the person to a location
- Find a person (occupation, pet item, or color)

Each town has 10 people. Out of all the people in each town only one is the demon. Each person has a clue in addition to the 5 attributes. All People have a task associated with them. When the player talks to a person they can choose to do their task. For people with only bad clues doing their task will give you their item. For people with good clues, if you do their task, you must choose to take their item or get the good clue. If you take their item you can't get the good clue. If you get the good clue you can't take their item. If you take the demon's item the person who has the clue about the demon's item will say the demon has nothing.
If the player escorts the demon to another location the clue information must update!

When the player talks to a person they have the option to "attack" them. If the person is the demon the player unlocs the dungeon and must find and kill the demon in the dungeon. If the person is not the demon the player loses the game.

Occupation List (fixed list 1 per town):
- Carpenter
- Barber
- Soldier
- Musician
- Farmer
- Blacksmith
- Merchant
- Tailor
- Baker
- Mayor

Pet List (fixed list):
- Dog
- Cat
- Fish
- Bird
- Snake
- Lizard
- Hamster
- Rabbit
- Turtle
- Ferret
- Horse
- Cow
- Sheep
- Pig
- Chicken

Color List (fixed list):
- Red
- Blue
- Green
- Yellow
- Purple
- Pink
  
Item List: randomly generated, each item is unique in the world

Clue tracking system:
- After speaking with a person their info is added to the clue tracking system so the player can review at any time via a menu (usable when paused)
- Person info includes their name, clue (if unlocked), their attributes and their task if any (can be set to active task from here)

Task tracking system:
- One "active task" at a time, player can choose when assigned or manage in menu
- When in the world a marker shows in the minimap where the location of the person the task is for is located so they can return when done
- On screen text says the current task and progress (if applicable) (ie Looking for [item], Killed X out of Y blobs)
- For escorts an additional marker shows where the escortee is located
- When in town a marker shows which person the active task is for

Task completions:
- Kill X enemies of a certain type and return to the person
- Find a person with a cartain attribute and tell them about it
- Find a person with a cartain item and return to the person
- Escort a person to a location
  
Escort task expanded:
- When the player activates the escort task the person will appear in the world outside the town they came from when the player next leaves the town
- The person will follow the player at a distance, they move at the same speed as the player
- If the player reaches the destination with the person the task succeeds

World Generation:
- Based on the number of towns generate ten times that number of items (1 unique per person in the world)
- Generate the world map including the towns and where they are located
- Generate a demon with random attributes
- Generate 5 good clues for the demon
  - The demon's town (will need to update this since the demon can change towns)
  - The demon's favorite color
  - The demon's pet 
  - The demon's occupation
  - The demon's item (will need to update this since the player can obtain the demon's item)
- Generate 1 lie the deamon will tell
  - Randomly pick a good clue (accept for location) and make it false
- Generate bad clues
  - All the occupations the demon is not
  - All the pets the demon does not have
  - All the colors the demon does not like
  - All the items the demon does not have
  - All the locations the demon is not in (will need to update this since the demon can change towns)
  - All relative locations the demon is in from each town the demon is not in (will need to track this since the demon can change towns)
- Generate 10 random people per town (-1 in the demon's town)
    - Randonly assign an image and a name
    - Randomly assign attributes to each person (location should be current town)
    - Occupations should be unique per town
    - Items should be unique per person
    - Don't assign tasks yet
    - Randomly assign a clue to each person (need to identify good clues from bad clues)
- Generate tasks
  - 1 Kill all enemies of a certain type for each type available in the world
  - 1 Find me a(n) occupation task per occupation (10)
  - 1 Find me who has a pet task per pet. Make sure this is possible because not all pet may be assigned! (15)
  - 1 Find me who likes a color task per color. Make sure this is possible because not all colors may be assigned! (6)
  - 1 Find me who has an item task per item (number of towns * 10)
  - 1 Escort task per town (number of towns)
- Randomly assign tasks to people (including the demon!)

## Minions
Depending on the total population of the world (number of towns * 10) the demon will have a certain number of minions. Should be configurable in the config file. Start with 1 per town. The minions also lie to help hide the demon otherwise they work exactly like normal people.

## Leveling system
The player has 4 stats that can be leveled up:
- Strength: Increases damage (max 5)
- Agility: Increases player movement speed (need to find max in code)
- Health: Increases number of hearts (max 10)
- Range: Increases player attack range (max 5)
- Max player level is 10

XP system:
Ther player gains xp by killing enemies. Level ups will be at 4xp, then 8xp, then 16xp, then 32xp, then 64xp, then 128xp, then 256xp, then 512xp, then 1024xp. At each level up the player can choose to increase one of their stats by 1. The amount of xp needed for each level up can be configured in the config file.

Base stats:
- Strength: 1
- Agility: 1
- Health: 3
- Range: 1

Dev notes
- Movement speed scales with the Agility stat and is configurable in `gameConfig.ts`.
- When range is increased the attack sprite should move further away from the player. Initially it will flash directly in front of the player (currently implemented). At higher levels it will move out in front of the player in the direction the player is facing. The distance increases 1 tile per level.
- All numbers (base stats, max stats, xp needed for level up, etc) should be configurable in the config file

## NPC Powers
Instead of NPC's giving the player items they can use powers to help the player. Powers are based on their occupation.

Powers:
| Occupation | Power                                                                      | Dialog                                                | Notes                                              |
| ---------- | -------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Farmer     | Tells the player if they have met the demon                                | "You have/ have not met the demon yet."               | ""                                                 |
| Musician   | Tells the player how many minions are in the current town                  | "There are [number] minions in this town."            | ""                                                 |
| Barber     | Introduces the player to a random numer of people between 1 and 5          | "I have introduced you to [number] people."           | Adds the people to the clue tracker                |
| Tailor     | Tells the player if someone in town is lying                xcc            | "Some poeple/No one in this town are/is lying."       | Add to clue tracker (special clue)                 |
| Mayor      | Introduces the player to everyone in town                                  | "I have introduced you to everyone in town."          | Adds all people in town to the clue tracker        |
| Merchant   | Introduces the player to a random person from another town                 | "Let me introduce you to [name] from [town]."         | Adds the person to the clue tracker                |
| Soldier    | Give the player 20 xp                                                      | "Nice training session!."                             | ""                                                 |
| Blacksmith | Improves one of the player's stats by 1                                    | "Hope this helps you in your quest."                  | Functionally same as leveling up                   |
| Carpenter  | Gives a location base bad clue                                             | "The demon is not in [location]."                     | Should be a clue that isn't known by any other NPC |
| Baker      | Tells the player the name of one person in their town who is not the demon | "[name] is not the demon."                            | ""                                                 |
| Minion     | Reveals they are a minion                                                  | "Ah, you caught me, but you will not find my master!" | ""                                                 |

Special Clues:
Special clues show up in the clue tracker as blue

## Temples
In addition to towns randomly in the world there will be temples. These will not be marked on the mini map. The map of each temple will be a maze generated using the drunken walk algorithm. Corridors will be 2 tiles wide and 2 tiles high. The start of the maze will be a random outer edge of the map and the end will be where the drunken walk algorithm stops. The exit will be at the start so the player can leave if they choose. At the end will be a chest with a specific magic item that will grant the player a permanent special power. The temple will also have a unique enemy (per temple).

Temples:
| Name         | Enemy            | Reward             | Reward Notes                                                                                                                                                                                                                                                                                                |
| ------------ | ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sky Temple   | Bees             | Winged Boots       | Allows the player to fly. The player presses Q to ascend, then Q again to descend. Similar to the demon                                                                                                                                                                                                     |
| Earth Temple | Man Eater Flower | Protection Aura    | The player can right click to become invulnerable while held. The player can't move or attack while invulnerable.                                                                                                                                                                                           |
| Space Temple | Arachne          | Teleportation Cape | The player can fast travel to any town in the world by pressing X. A menu will pop up listing all the towns.                                                                                                                                                                                                |
| Light Temple | Eye              | Eye of Truth       | When speaking to an NPC the player will know if they are lying. The rumor will be in red if the NPC is lying (both minion and demon rumors).                                                                                                                                                                |
| Fire Temple  | Fire skull       | Fire Bombs         | The player can place fire bombs on the ground by pressing Z. The fire bomb will explode after 3 seconds and deal 5 damage to any enemy within 5 tiles. It will also destroy any walls within 5 tiles (overworld only). The player cannot place firebombs in towns. Only 1 firebomb can be active at a time. |

Temple Enemies:
| Name       | Health | Damage | XP  | Behavior                                                                                                             |
| ---------- | ------ | ------ | --- | -------------------------------------------------------------------------------------------------------------------- |
| Bee        | 6      | 1      | 5   | Like the demon, but no projectile or phases. When it charges moves as fast as the demon projectile.                  |
| Plant      | 7      | 2      | 6   | Stays still until the player is within 5 tiles. Then it charges at the player until it hits a wall or the player.    |
| Drider     | 10     | 2      | 10  | Wanders around until the player is within 5 tiles. Then it charges at the player until it hits a wall or the player. |
| Eye        | 8      | 2      | 8   | Wanders around until the player is within 10 tiles. Then it Shoots a lazer blast at the player.                      |
| Fire Skull | 5      | 2      | 5   | Moves in a straight line until it hits a wall then changes direction. Very fast.                                     |

## Final Demon Fight
If the player correctly accuses the demon the player will be teleported to a new area where they must fight the demon. This new area will have a black sky and there will be random red pilars (for now just red blocks 2 tiles high) scattered around the area. The demon will be in the center of the area. The demon will have 30 hp and 3 phases. 

Phase 1 (20hp+):
- If the player is withing 5 tiles the demon will charge at the player until it hits a wall or the player. The player must dodge the charge. The demon will then back up and charge again repeatedly. When it charges it should be as fast a soldier, but should back up at the speed of a snake.
- If the player is outside of 5 tiles the demon will fly up 3 tiles and shoot an evil projectile (7 animation files in public/sprites/sliced/evilProjectile[1-7].png ) at the player. The projectile will travel in a straight line until it hits a wall or the player. The projectile should be as fast as a bandit.

Phase 2 (10hp-20hp):
- At the begining of this phase the demon will move to the center of the area and summon 3 random minions to fight the player.
- Then the demon will resume it's phase 1 attacks.

Phase 3 (0hp-10hp):
- The demon will stay 2 tiles in the air and shoot 3 projectiles at the player in a spread pattern. The projectiles will travel in a straight line until they hit a wall or the player. The projectiles should be as fast as a bandit.

Cheat codes:
In order to test this without having to find the demon the player should be able to press ~ to focus an input where they can type commands. The commands should be (not case sensitive):
- liliana: Teleports the player to the demon
- urza: maxes out the player's stats
- jace: reveals all good clues
- passport [town_id]: Teleports the player to a town with the given id
- krang: Immediately gives the player 100xp

## Maybe

# NPC Abilities
Different npcs have combat abilities they can use when being escorted:
- Revives the player if they are dead (only once)
- Damages an enemy the player has attacked
- Heals the player if no enemies are close

# NPC Conversation
Add another option to the NPC dialog to Talk to the NPC. The NPC will tell you some lore about the town, the world, or the demon.

# NPC Houses
The towns already have a house for each person, but currently the door don't do anything. Add a way to open the door and interact with the house. Maybe the houses are locked and get unlocked when the player completes the NPC task. Maybe there is a way for the player to break in.
Inside the house there could be an npc journal that the player can read to get more information about the town and the demon.

# Town market / Town Hall
There is one big building in each town. Currently the door does nothing. Add a new location type for the market and add a way to open the door and interact with the market. Maybe the market has a shop where the player can buy items.

Should it be a full 3d building or just a door that opens to a shop?
What items would be sold at the market?

What would a town hall have?

# Potions
Add a new item type for potions. Potions can be used to heal the player. The player would have a potion supply and could use them to heal by pressing 1.

Where do potions come from?

# Magic item Slots
Currently the player can collect as many magic items as they want. Add a limit to the number of magic items the player can have active at a time. The player can level up to unlock more slots. Possibly replaces Agility which isn't very useful.

# Secret Locations
Add secret locations the player can only reach by flying or by bombs.
How to procedurally generate these locations?
What would be in these locations?


## Probably Not

# Time Challenge
Challenge is timed, you have a certain amount of time to find the demon

# Progression
- Start with 2 towns and only blobs in the world (Limits task options)
- Once you find the demo you unlock a dungeon and must find the demon and kill it
- The dungeon is a maze with the demon as a boss
- After killing the demon you unlock a new world with more towns and new monsters, all new people and a new demon
- Different worlds are show by changing the images for the terrain and monsters