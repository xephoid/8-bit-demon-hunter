Mini Burger


Objective:
Find the demon in the world.

People all have 5 attributes:
- Location (town)
- Favorite color
- Pet
- Occupation
- Item

People give clues for who the demon is. Clue examples:

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
- The person will follow the player at a distance, they move slower than the player
- If the person is killed the task resets when the player next leaves a town
- If the player dies the task also resets when the player respawns
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
- The current hard coded speed is very fast. I Think it should be the max the player can get! But also the min should not be too slow. Will need to find a good balance.
- When range is increased the attack sprite should move further away from the player. Initially it will flash directly in front of the player (currently implemented). At higher levels it will move out in front of the player in the direction the player is facing. The distance increases 1 tile per level.
- All numbers (base stats, max stats, xp needed for level up, etc) should be configurable in the config file

## NPC Powers (NEW)
Instead of NPC's giving the player items they can use powers to help the player. Powers are based on their occupation.

Powers:
| Occupation | Power                                                                      | Dialog                                                | Notes                                              |
| ---------- | -------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Farmer     | Tells the player if they have met the demon                                | "You have/ have not met the demon yet."               | ""                                                 |
| Musician   | Tells the player how many minions are in the current town                  | "There are [number] minions in this town."            | ""                                                 |
| Barber     | Introduces the player to a random numer of people between 1 and 5          | "I have introduced you to [number] people."           | Adds the people to the clue tracker                |
| Tailor     | Tells the player if someone in town is lying                               | "Some poeple/No one in this town are/is lying."       | Add to clue tracker (special clue)                 |
| Mayor      | Introduces the player to everyone in town                                  | "I have introduced you to everyone in town."          | Adds all people in town to the clue tracker        |
| Merchant   | Introduces the player to a random person from another town                 | "Let me introduce you to [name] from [town]."         | Adds the person to the clue tracker                |
| Soldier    | Give the player 20 xp                                                      | "Nice training session!."                             | ""                                                 |
| Blacksmith | Improves one of the player's stats by 1                                    | "Hope this helps you in your quest."                  | Functionally same as leveling up                   |
| Carpenter  | Gives a location base bad clue                                             | "The demon is not in [location]."                     | Should be a clue that isn't known by any other NPC |
| Baker      | Tells the player the name of one person in their town who is not the demon | "[name] is not the demon."                            | ""                                                 |
| Minion     | Reveals they are a minion                                                  | "Ah, you caught me, but you will not find my master!" | ""                                                 |

Special Clues:
Special clues show up in the clue tracker as blue

## Maybe
Challenge is timed, you have a certain amount of time to find the demon

Possible Progression:
- Start with 2 towns and only blobs in the world (Limits task options)
- Once you find the demo you unlock a dungeon and must find the demon and kill it
- The dungeon is a maze with the demon as a boss
- After killing the demon you unlock a new world with more towns and new monsters, all new people and a new demon
- Different worlds are show by changing the images for the terrain and monsters