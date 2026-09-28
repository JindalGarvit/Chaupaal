/**
 * Scribble word packs (Dangal P5) — server only; words are dealt here and never shipped to clients.
 * Global English core packs, difficulty-tagged (easy / medium / hard), all teen-safe.
 * Regional packs are optional add-ons, never on by default.
 */
'use strict';

const split = (s) =>
  String(s)
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

const RAW = {
  everyday: {
    easy:
      'chair, table, bed, door, window, lamp, cup, spoon, fork, knife, plate, bowl, clock, key, book, pen, pencil, phone, bag, hat, shoe, sock, shirt, glasses, umbrella, bottle, box, ball, comb, brush, soap, towel, mirror, pillow, blanket, candle, bucket, broom, ladder, basket, wallet, ring, button, scissors, tape, paper, envelope, stamp, bell, kite',
    medium:
      'toothbrush, toothpaste, hairdryer, sofa, bookshelf, curtain, doormat, bathtub, shower, sink, toilet, fridge, oven, toaster, kettle, microwave, blender, frying pan, teapot, mug, backpack, suitcase, sunglasses, necklace, bracelet, earring, wristwatch, calendar, notebook, stapler, paperclip, eraser, ruler, calculator, flashlight, battery, light bulb, plug, remote control, keyboard, headphones, charger, trash can, clothes peg, hanger, zipper, shoelace, mitten, scarf, raincoat, slippers, apron, iron, vacuum cleaner, dustpan, sponge, plunger, padlock, piggy bank, alarm clock',
    hard:
      'thermostat, colander, ladle, whisk, rolling pin, corkscrew, can opener, cheese grater, doorknob, hinge, coat rack, ottoman, chandelier, wardrobe, drawer, radiator, extension cord, fuse box, thimble, safety pin, sewing machine, measuring tape, magnifying glass, hourglass, compass, tripod, dumbbell, yoga mat, bookmark, receipt, coupon, keychain, lanyard, handkerchief, cufflinks, hairpin, tweezers, nail clipper, shaving cream, deodorant',
  },
  animals: {
    easy:
      'cat, dog, fish, bird, cow, pig, horse, sheep, duck, chicken, frog, snake, lion, tiger, bear, monkey, elephant, giraffe, zebra, rabbit, mouse, turtle, owl, bee, ant, spider, butterfly, snail, whale, shark, crab, fox, wolf, deer, goat, camel, penguin, dolphin, octopus, bat',
    medium:
      'kangaroo, koala, panda, hippo, rhino, crocodile, alligator, flamingo, peacock, parrot, eagle, hawk, swan, goose, turkey, ostrich, squirrel, hedgehog, raccoon, skunk, beaver, otter, seal, walrus, jellyfish, starfish, seahorse, lobster, shrimp, ladybug, dragonfly, grasshopper, caterpillar, worm, mosquito, scorpion, lizard, chameleon, gorilla, chimpanzee, cheetah, leopard, hamster, donkey, llama, moose, polar bear, puppy, kitten, pony',
    hard:
      'platypus, armadillo, anteater, sloth, porcupine, meerkat, mongoose, hyena, warthog, wildebeest, gazelle, bison, yak, alpaca, pelican, toucan, woodpecker, hummingbird, vulture, stingray, swordfish, pufferfish, narwhal, manatee, axolotl, iguana, tadpole, centipede, praying mantis, firefly, beetle, cockroach, lemur, orangutan, koi, salamander, chinchilla, ferret, badger, mole',
  },
  food: {
    easy:
      'apple, banana, orange, grapes, lemon, cherry, pear, carrot, potato, tomato, corn, egg, bread, cheese, milk, cake, cookie, pizza, burger, rice, soup, candy, ice cream, honey, juice, tea, coffee, pie, donut, popcorn',
    medium:
      'strawberry, watermelon, pineapple, mango, coconut, avocado, broccoli, mushroom, onion, garlic, pepper, cucumber, pumpkin, lettuce, sandwich, hot dog, french fries, pancake, waffle, cupcake, muffin, croissant, pretzel, noodles, spaghetti, taco, burrito, sushi, dumpling, salad, omelette, bacon, sausage, steak, chocolate, lollipop, jelly, milkshake, smoothie, cereal, yogurt, butter, peanut, popsicle, cotton candy, birthday cake, fried egg, toast, bagel, lemonade',
    hard:
      'artichoke, asparagus, eggplant, zucchini, radish, beetroot, cauliflower, kiwi, pomegranate, dragon fruit, papaya, fig, blueberry, raspberry, cinnamon roll, macaron, cheesecake, lasagna, ravioli, paella, kebab, falafel, hummus, guacamole, nachos, quesadilla, spring roll, fortune cookie, gingerbread man, candy cane, marshmallow, pudding, souffle, tiramisu, brownie, granola, oatmeal, sundae, s\u2019more, chopsticks',
  },
  actions: {
    easy:
      'run, jump, swim, sleep, eat, drink, read, write, sing, dance, cry, laugh, walk, sit, climb, throw, catch, kick, clap, wave, push, pull, cook, paint, draw, fly, fall, hug, smile, yawn',
    medium:
      'skipping, skating, surfing, skiing, fishing, camping, hiking, juggling, whistling, sneezing, coughing, shouting, whispering, knocking, digging, sweeping, ironing, knitting, sewing, gardening, driving, cycling, rowing, diving, bowling, boxing, wrestling, stretching, meditating, typing, texting, taking a selfie, brushing teeth, tying shoes, washing hands, blowing bubbles, flying a kite, building a snowman, jumping rope, playing guitar, walking the dog, taking a bath, making a wish, opening a present, falling asleep',
    hard:
      'sleepwalking, eavesdropping, procrastinating, daydreaming, hibernating, sunbathing, snorkeling, skydiving, bungee jumping, parachuting, rock climbing, tightrope walking, ventriloquism, hitchhiking, window shopping, moonwalking, breakdancing, arm wrestling, somersault, cartwheel, handstand, high five, thumbs up, shrugging, winking, blushing, tiptoeing, limping, crawling, sneaking',
  },
  places: {
    easy:
      'house, school, park, beach, farm, zoo, shop, bank, hospital, library, castle, island, forest, desert, mountain, river, lake, road, bridge, garden, kitchen, bedroom, bathroom, church, tent, cave, city, village, airport, station',
    medium:
      'restaurant, supermarket, bakery, pharmacy, post office, police station, fire station, museum, theater, cinema, stadium, gym, swimming pool, playground, amusement park, aquarium, lighthouse, skyscraper, apartment, garage, basement, attic, balcony, backyard, barn, windmill, pyramid, igloo, treehouse, harbor, parking lot, bus stop, train station, gas station, hotel, campsite, waterfall, volcano, jungle, north pole',
    hard:
      'observatory, planetarium, greenhouse, vineyard, orchard, quarry, canyon, glacier, lagoon, oasis, marsh, swamp, peninsula, archipelago, courthouse, parliament, embassy, monastery, cathedral, colosseum, laundromat, arcade, bowling alley, ice rink, ski lift, roller coaster, ferris wheel, carousel, maze, dungeon',
  },
  movies: {
    easy:
      'movie, popcorn, camera, ticket, actor, star, robot, alien, ghost, monster, pirate, cowboy, king, queen, princess, knight, wizard, witch, dragon, fairy, clown, ninja, zombie, vampire, mermaid, superhero, villain, cartoon, puppet, magic',
    medium:
      'director, stuntman, red carpet, spotlight, microphone, film reel, clapperboard, trailer, sequel, remote, television, sitcom, game show, news anchor, weather forecast, spaceship, time machine, treasure map, haunted house, secret agent, detective, mummy, werewolf, giant, genie, unicorn, crown, magic wand, invisibility cloak, flying carpet, laser sword, cape, mask, sidekick, talking animal, happy ending, love story, car chase, explosion, soundtrack',
    hard:
      'cliffhanger, plot twist, flashback, slow motion, green screen, special effects, blooper, audition, rehearsal, premiere, box office, documentary, animation, stop motion, subtitles, dubbing, screenplay, casting, extras, costume designer, makeup artist, film festival, award ceremony, trophy, standing ovation, binge watching, season finale, spin off, prequel, reboot',
  },
  sports: {
    easy:
      'ball, bat, goal, net, run, race, medal, trophy, bike, skate, swim, golf, tennis, football, soccer, basketball, baseball, boxing, karate, yoga, surf, ski, sled, helmet, whistle',
    medium:
      'volleyball, badminton, table tennis, hockey, ice hockey, rugby, cricket, archery, fencing, wrestling, judo, gymnastics, marathon, relay, hurdles, high jump, long jump, pole vault, javelin, discus, weightlifting, rowing, sailing, canoe, kayak, snowboard, skateboard, roller skates, scoreboard, referee, goalkeeper, stadium, finish line, starting line, dumbbell, treadmill, boxing gloves, shuttlecock, racket, golf club',
    hard:
      'triathlon, decathlon, bobsleigh, curling, water polo, synchronized swimming, lacrosse, polo, squash, darts, billiards, bowling pin, penalty kick, free throw, slam dunk, home run, hat trick, photo finish, podium, jersey, cleats, shin guard, mouthguard, stopwatch, locker room, cheerleader, mascot, halftime, overtime, tie breaker',
  },
  nature: {
    easy:
      'sun, moon, star, cloud, rain, snow, wind, tree, flower, leaf, grass, rock, sand, sea, wave, fire, ice, sky, rainbow, storm, hill, rose, seed, apple tree, puddle',
    medium:
      'sunflower, tulip, daisy, cactus, palm tree, pine tree, mushroom, acorn, pinecone, thunder, lightning, tornado, hurricane, earthquake, avalanche, fog, frost, icicle, snowflake, sunrise, sunset, eclipse, comet, meteor, planet, galaxy, waterfall, river bank, coral reef, iceberg, cliff, meadow, pond, stream, bamboo, vine, moss, fern, seashell, pebble',
    hard:
      'aurora, constellation, stalactite, geyser, tide, drought, monsoon, blizzard, sandstorm, whirlpool, tsunami, erosion, fossil, crystal, magma, lava, crater, dune, tundra, savanna, rainforest, mangrove, delta, estuary, bonsai, lotus, orchid, willow, redwood, dandelion',
  },
  tech: {
    easy:
      'phone, computer, laptop, tv, radio, camera, robot, rocket, game, mouse, screen, battery, light, car, train, plane, bus, boat, drone, watch',
    medium:
      'tablet, keyboard, printer, speaker, headphones, microphone, webcam, smartwatch, game controller, joystick, satellite, antenna, router, usb stick, charger, power bank, calculator, video call, selfie stick, virtual reality, 3d glasses, electric car, scooter, helicopter, submarine, spaceship, telescope, microscope, traffic light, escalator, elevator, vending machine, cash machine, barcode, qr code, password, email, emoji, wifi, bluetooth',
    hard:
      'algorithm, artificial intelligence, cloud storage, firewall, hacker, circuit board, microchip, motherboard, hard drive, touchscreen, fingerprint scanner, face id, hologram, jetpack, hoverboard, self driving car, solar panel, wind turbine, nuclear reactor, space station, mars rover, 3d printer, cryptocurrency, podcast, livestream, loading bar, error message, software update, blue screen, pop up',
  },
  hardmode: {
    hard:
      'photosynthesis, gravity, democracy, nostalgia, jealousy, freedom, justice, balance, silence, echo, shadow, reflection, invisible, infinity, evolution, recycling, pollution, inflation, gossip, sarcasm, deja vu, midlife crisis, social media, fake news, peer pressure, time zone, jet lag, identity theft, brainstorm, bucket list, comfort zone, elephant in the room, piece of cake, once in a blue moon, raining cats and dogs, break the ice, hit the road, spill the beans, under the weather, cold feet, butterflies in stomach, white lie, dark horse, wild goose chase, cloud nine, last straw, couch potato, night owl, early bird, bookworm, copycat, scapegoat, black sheep, red tape, glass ceiling, blind spot, domino effect, snowball effect, chain reaction, optical illusion, sleep paralysis, stage fright, writer\u2019s block, brain freeze, butterfly effect, fountain of youth, pandora\u2019s box, trojan horse, achilles heel, needle in a haystack, tip of the iceberg, calm before the storm, silver lining',
  },
};

/** Second batch per pack (merged into RAW below). */
const MORE = {
  everyday: {
    easy: 'sofa bed, spoonful, cushion, fan, rug, shelf, crayon, marker, glue, sticker, gift, balloon, flag, map, coin, magnet, lock, torch, cap, belt, glove, boot, dress, skirt, jacket, tie, sweater, jeans, pyjamas, bowtie',
    medium: 'laundry basket, washing machine, dishwasher, ice tray, lunchbox, water bottle, thermos, place mat, napkin, tablecloth, flower vase, picture frame, photo album, wall clock, coat hook, shoe rack, bunk bed, crib, high chair, rocking chair, bean bag, bedside table, desk lamp, night light, smoke alarm, doorbell, mailbox, welcome mat, garden hose, watering can',
    hard: 'lint roller, ice pack, first aid kit, sticky note, rubber band, push pin, whiteboard, chalkboard, sharpener, protractor, clipboard, binder, filing cabinet, shredder, paper plane, origami, jigsaw puzzle, rubik\u2019s cube, snow globe, wind chime',
  },
  animals: {
    easy: 'lamb, calf, chick, crow, pigeon, parrot fish, goldfish, hen, rooster, bunny, ox, mule, seagull, clam, oyster, squid, eel, moth, flea, fly',
    medium: 'buffalo, reindeer, elk, antelope, jaguar, panther, cougar, lynx, bobcat, coyote, jackal, dingo, wombat, tortoise, gecko, cobra, python, rattlesnake, toad, newt, sparrow, robin, bluebird, canary, magpie, raven, heron, stork, crane, kingfisher',
    hard: 'hammerhead shark, killer whale, blue whale, sea lion, sea turtle, sea urchin, hermit crab, electric eel, anglerfish, barracuda, tarantula, black widow, termite, wasp, hornet, bumblebee, silkworm, earthworm, leech, flying squirrel',
  },
  food: {
    easy: 'plum, peach, melon, lime, bean, pea, jam, salt, sugar, nut, sweet, chips, crisps, gum, cola, water, bun, roll, tart, jelly bean',
    medium: 'hamburger, cheeseburger, meatball, chicken wing, drumstick, fish and chips, mashed potato, baked potato, corn on the cob, garlic bread, grilled cheese, club sandwich, fruit salad, apple pie, pumpkin pie, carrot cake, ice lolly, hot chocolate, iced tea, orange juice, coconut water, soda can, ketchup, mustard, mayonnaise, vinegar, olive oil, flour, egg roll, samosa',
    hard: 'sourdough, baguette, focaccia, brioche, crepe, churros, empanada, ramen, pho, bibimbap, kimchi, tempura, miso soup, curry, biryani, tandoori chicken, naan, dim sum, peking duck, pad thai, gelato, sorbet, fondue, raclette, charcuterie, ceviche, poke bowl, acai bowl, bubble tea, espresso',
  },
  actions: {
    easy: 'hop, spin, roll, bake, wash, clean, shop, play, pray, think, look, listen, point, blink, kiss, bite, lick, chew, snore, shiver',
    medium: 'painting nails, combing hair, shaving, making the bed, doing homework, taking notes, reading a map, pitching a tent, lighting a candle, carving a pumpkin, decorating a tree, wrapping a gift, blowing out candles, popping a balloon, catching a bus, missing the bus, waiting in line, hailing a taxi, paying the bill, counting money, planting a tree, watering plants, mowing the lawn, raking leaves, shoveling snow, feeding the birds, milking a cow, riding a horse, walking on stilts, flipping a pancake',
    hard: 'photobombing, speed dating, sleep talking, lip syncing, head banging, crowd surfing, channel surfing, doom scrolling, spring cleaning, sword swallowing, fire breathing, plate spinning, tap dancing, belly dancing, figure skating, speed skating, synchronized diving, beatboxing, air guitar, stargazing',
  },
  places: {
    easy: 'shop window, market, office, room, yard, pool, gate, wall, tower, hut, well, dam, port, field, valley, ocean, space, moon base, north, south',
    medium: 'classroom, playground slide, dentist, hair salon, barber shop, flower shop, toy shop, bookshop, coffee shop, ice cream shop, pet shop, bus station, subway, tunnel, highway, crossroads, roundabout, zebra crossing, car wash, petrol pump, factory, warehouse, farmhouse, cottage, palace, fortress, temple, mosque, synagogue, ruins',
    hard: 'botanical garden, wildlife reserve, national park, theme park, water park, drive in, food court, night market, flea market, shopping mall, departure lounge, baggage claim, control tower, launch pad, submarine base, oil rig, space shuttle, bus depot, city hall, town square',
  },
  movies: {
    easy: 'hero, cape, film, scene, show, actor, fan, drama, song, band, stage, circus, magician, juggler, acrobat, puppet show, disco, party, parade, fireworks',
    medium: 'movie theater, drive in movie, 3d movie, horror movie, comedy, musical, western, cartoon cat, cartoon mouse, talking car, toy box, robot dog, space alien, flying saucer, treasure chest, pirate ship, shipwreck, desert island, jungle explorer, archaeologist, mad scientist, evil laugh, secret lair, underground base, disguise, fake mustache, jail break, bank robbery, getaway car, bodyguard',
    hard: 'time travel, parallel universe, zombie apocalypse, alien invasion, heist, mind reading, superpower, shape shifter, invisibility, teleportation, sword fight, final battle, training montage, dramatic exit, redemption arc, fourth wall, jump scare, opening credits, end credits, post credits scene',
  },
  sports: {
    easy: 'kick, dive, skip, lap, team, coach, fan, cup, prize, shoot, pass, score, win, lose, draw, gym, pool, track, rope, hoop',
    medium: 'goalpost, penalty, corner kick, header, dribble, tackle, pitch, court, rink, ring, dugout, pitcher, catcher, batter, quarterback, touchdown, surfboard, wetsuit, ski pole, sled dog, skipping rope, punching bag, balance beam, pommel horse, trampoline, climbing wall, bicycle kick, bench press, push up, sit up',
    hard: 'offside, red card, yellow card, var check, extra time, sudden death, marathon runner, sprinter, relay baton, pole vaulter, figure eight, triple jump, shot put, hammer throw, horse racing, show jumping, dressage, motor racing, pit stop, chequered flag',
  },
  nature: {
    easy: 'bush, twig, root, bark, petal, nest, egg, shell, mud, dust, soil, cliff top, island, lake shore, beach ball, sun hat, hail, mist, dew, breeze',
    medium: 'forest fire, rain cloud, thunderstorm, heat wave, cold wind, spring, summer, autumn, winter, snowstorm, flower bed, rose bush, lily pad, water lily, clover, four leaf clover, oak tree, maple leaf, cherry blossom, weeping willow, hedge, sand castle, rock pool, tide pool, mountain peak, hilltop, riverbed, stepping stones, cave painting, desert rose',
    hard: 'northern lights, shooting star, full moon, half moon, crescent moon, solar system, black hole, milky way, big dipper, ozone layer, water cycle, food chain, greenhouse effect, carbon footprint, climate change, ecosystem, biodiversity, hibernation, migration, pollination',
  },
  tech: {
    easy: 'game, app, chip, code, click, link, cable, plug in, fan, lamp post, clock tower, car key, alarm, bell, horn, siren, tractor, crane, digger, truck',
    medium: 'fire truck, ambulance, police car, taxi, limousine, race car, monster truck, tow truck, garbage truck, cement mixer, bulldozer, forklift, steam train, bullet train, cable car, hot air balloon, glider, jet ski, speedboat, sailboat, cruise ship, container ship, rowing boat, canoe paddle, space rocket, astronaut, space suit, moon landing, radar, sonar',
    hard: 'search engine, social network, dark mode, screenshot, screen time, battery low, airplane mode, voice assistant, smart home, smart fridge, robot vacuum, facial recognition, augmented reality, metaverse, blockchain, machine learning, chatbot, deepfake, spam folder, captcha',
  },
  hardmode: {
    hard: 'happiness, anger, fear, surprise, boredom, confusion, curiosity, patience, courage, wisdom, luck, karma, destiny, memory, imagination, creativity, ambition, loneliness, friendship, teamwork, leadership, honesty, forgiveness, gratitude, pride, shame, guilt, relief, excitement, anxiety, homesick, awkward silence, inside joke, dad joke, plot armor, main character, side quest, speed bump, rush hour, road rage',
  },
};
Object.keys(MORE).forEach((id) => {
  ['easy', 'medium', 'hard'].forEach((d) => {
    if (!MORE[id][d]) return;
    RAW[id][d] = (RAW[id][d] ? RAW[id][d] + ', ' : '') + MORE[id][d];
  });
});

const REGIONAL = {
  bollywood: {
    easy: 'dance, song, hero, heroine, villain, rain dance, train, wedding, mother, drama',
    medium:
      'item song, slow motion, dream sequence, love triangle, lost twins, dance-off, mustache, sunglasses, motorbike, mansion, tea stall, rickshaw, film city, filmfare, playback singer, choreographer, box office, interval, double role, sari',
    hard:
      'angry young man, fake death, climax fight, college romance, arranged marriage, family drama, revenge story, mela, dhol, sangeet, mehndi, haldi, baraat, qawwali, ghazal, mujra, masala movie, remake, cameo, flashback song',
  },
  cricket: {
    easy: 'bat, ball, wicket, stumps, pitch, run, six, four, catch, umpire',
    medium:
      'bowler, batsman, fielder, wicketkeeper, helmet, pads, gloves, bails, crease, boundary, scoreboard, century, maiden over, no ball, wide, run out, stumped, spinner, fast bowler, captain',
    hard:
      'googly, yorker, bouncer, leg before wicket, hat trick, duck, golden duck, reverse sweep, helicopter shot, super over, powerplay, third umpire, drs review, follow on, declaration, silly point, slip cordon, nightwatchman, dead ball, free hit',
  },
};

const PACKS = {};
function load(src, regional) {
  Object.keys(src).forEach((id) => {
    const p = src[id];
    PACKS[id] = { id, regional: !!regional, easy: split(p.easy || ''), medium: split(p.medium || ''), hard: split(p.hard || '') };
  });
}
load(RAW, false);
load(REGIONAL, true);

/** Every word in these packs, tagged with difficulty (deduped, first pack wins). */
function wordsFor(packIds) {
  const seen = new Set();
  const out = { easy: [], medium: [], hard: [] };
  (packIds || []).forEach((id) => {
    const p = PACKS[id];
    if (!p) return;
    ['easy', 'medium', 'hard'].forEach((d) =>
      p[d].forEach((w) => {
        if (seen.has(w)) return;
        seen.add(w);
        out[d].push(w);
      })
    );
  });
  return out;
}

function stats() {
  const core = wordsFor(Object.keys(RAW));
  return {
    core: core.easy.length + core.medium.length + core.hard.length,
    easy: core.easy.length,
    medium: core.medium.length,
    hard: core.hard.length,
    regional: Object.keys(REGIONAL).reduce((n, id) => n + PACKS[id].easy.length + PACKS[id].medium.length + PACKS[id].hard.length, 0),
  };
}

module.exports = { PACKS, wordsFor, stats, CORE_IDS: Object.keys(RAW), REGIONAL_IDS: Object.keys(REGIONAL) };
