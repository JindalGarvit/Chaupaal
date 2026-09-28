/**
 * Quiz Muqabala handwritten questions (Dangal P6). Server-only.
 * Row: prompt | correct | wrong | wrong | wrong | tier | explanation
 * The correct option is always authored first; options are shuffled per match.
 */
'use strict';

const HANDWRITTEN = {
  gk: `
How many days are there in a leap year?|366|365|364|367|1|A leap year adds 29 February, making 366 days.
How many continents are there on Earth (the common seven-continent model)?|7|5|6|8|1|Africa, Antarctica, Asia, Europe, North America, Oceania and South America.
How many minutes are in one hour?|60|100|30|90|1|One hour is 60 minutes.
How many sides does a hexagon have?|6|5|7|8|1|"Hex" means six.
How many sides does an octagon have?|8|6|10|12|1|"Octa" means eight — like a stop sign.
What is the largest ocean on Earth?|Pacific Ocean|Atlantic Ocean|Indian Ocean|Arctic Ocean|1|The Pacific covers about a third of Earth's surface.
Which colour do you get by mixing blue and yellow paint?|Green|Purple|Orange|Brown|1|Blue and yellow are primaries that make green.
How many strings does a standard violin have?|4|5|6|3|2|A violin has four strings: G, D, A and E.
How many pieces are on a chessboard at the start of a game?|32|16|24|36|2|Each side starts with 16 pieces.
How many hours are in a week?|168|144|172|120|2|7 days × 24 hours = 168.
Which is the smallest prime number?|2|1|3|0|1|2 is the only even prime; 1 is not prime.
What is the freezing point of water in degrees Celsius?|0|32|100|-10|1|Pure water freezes at 0 °C at sea level.
What is the boiling point of water at sea level in degrees Fahrenheit?|212|100|180|232|2|Water boils at 212 °F (100 °C) at sea level.
How many zeros are in one million?|6|5|7|9|1|1,000,000 has six zeros.
How many cards are in a standard deck without jokers?|52|54|48|50|1|Four suits of 13 cards each.
What shape has three sides?|Triangle|Square|Pentagon|Circle|1|"Tri" means three.
In which direction does the Sun rise?|East|West|North|South|1|Earth spins west to east, so the Sun appears in the east.
How many colours are in a traditional rainbow?|7|6|5|8|1|Red, orange, yellow, green, blue, indigo and violet.
What is the tallest animal in the world?|Giraffe|Elephant|Ostrich|Moose|1|Adult giraffes can exceed 5 metres.
What is the largest planet in our solar system?|Jupiter|Saturn|Neptune|Earth|1|Jupiter is more than twice as massive as all other planets combined.
How many legs does a spider have?|8|6|10|12|1|Spiders are arachnids with eight legs.
Which gas do plants absorb from the air for photosynthesis?|Carbon dioxide|Oxygen|Nitrogen|Hydrogen|1|Plants take in CO₂ and release oxygen.
What is the hardest natural substance?|Diamond|Quartz|Granite|Iron|1|Diamond scores 10 on the Mohs hardness scale.
How many years are in a century?|100|10|1000|50|1|A century is 100 years.
How many years are in a millennium?|1000|100|500|10000|1|A millennium is 1,000 years.
Which month has the fewest days?|February|April|June|November|1|February has 28 days, or 29 in a leap year.
What do bees collect from flowers to make honey?|Nectar|Pollen only|Sap|Dew|2|Bees turn flower nectar into honey.
Which is the only mammal capable of true flight?|Bat|Flying squirrel|Sugar glider|Colugo|2|Flying squirrels glide; bats truly fly.
How many teeth does a typical adult human have?|32|28|30|36|2|Including four wisdom teeth, adults have 32.
How many bones are in the adult human body?|206|180|212|300|2|Babies have about 300 bones that fuse to 206.
What is the chemical formula for water?|H₂O|CO₂|O₂|NaCl|1|Two hydrogen atoms and one oxygen atom.
Which planet is known as the Red Planet?|Mars|Venus|Jupiter|Mercury|1|Iron oxide dust makes Mars look red.
What is the square root of 144?|12|14|11|16|1|12 × 12 = 144.
What is 15% of 200?|30|15|20|35|2|0.15 × 200 = 30.
What is the largest desert in the world, including polar deserts?|Antarctic Desert|Sahara|Gobi|Arabian Desert|3|Antarctica is a desert because it gets so little precipitation.
What is the largest hot desert in the world?|Sahara|Gobi|Kalahari|Atacama|1|The Sahara covers much of North Africa.
Which famous ship sank on its maiden voyage in 1912?|Titanic|Lusitania|Queen Mary|Mayflower|1|RMS Titanic struck an iceberg in the North Atlantic.
What is the currency symbol £ used for?|Pound sterling|Euro|Yen|Dollar|1|£ is the pound sign.
What does a thermometer measure?|Temperature|Air pressure|Humidity|Wind speed|1|Thermo- relates to heat.
What does a barometer measure?|Air pressure|Temperature|Rainfall|Wind direction|2|Barometers track atmospheric pressure.
What is the name for a baby cat?|Kitten|Cub|Pup|Kit|1|Young cats are kittens.
How many degrees are in a right angle?|90|180|45|360|1|A right angle is a quarter turn.
How many degrees are in a full circle?|360|180|90|400|1|A full turn is 360 degrees.
What is the longest bone in the human body?|Femur|Tibia|Humerus|Spine|2|The femur (thigh bone) is the longest.
Which organ pumps blood around the body?|Heart|Lungs|Liver|Kidneys|1|The heart pumps blood through the circulatory system.
What is the largest organ of the human body?|Skin|Liver|Brain|Lungs|2|Skin is the body's largest organ by area and weight.
What is the name of the imaginary line around the middle of the Earth?|Equator|Prime meridian|Tropic of Cancer|Arctic Circle|1|The equator is at 0° latitude.
Which instrument has 88 keys?|Piano|Organ|Accordion|Harpsichord|1|A standard piano has 88 keys.
Which is heavier: a kilogram of feathers or a kilogram of stone?|They weigh the same|Stone|Feathers|It depends on the weather|1|A kilogram is a kilogram.
How many sides does a pentagon have?|5|6|4|7|1|"Penta" means five.
What is the most spoken first language in the world?|Mandarin Chinese|English|Spanish|Hindi|2|Mandarin has the most native speakers.
What is the name of the fairy-tale girl who visits the three bears?|Goldilocks|Little Red Riding Hood|Cinderella|Rapunzel|1|Goldilocks tries the bears' porridge, chairs and beds.
What do you call a word that reads the same backwards, like "level"?|Palindrome|Anagram|Acronym|Homophone|2|Palindromes read the same in both directions.
Which country gifted the Statue of Liberty to the United States?|France|United Kingdom|Spain|Italy|1|It was a gift from the people of France in 1886.
What is the primary ingredient in guacamole?|Avocado|Tomato|Lime|Cucumber|1|Guacamole is mashed avocado.
Which planet is closest to the Sun?|Mercury|Venus|Mars|Earth|1|Mercury orbits closest to the Sun.
What is the capital city with the highest elevation in the world (seat of government)?|La Paz|Quito|Bogotá|Kathmandu|3|La Paz, Bolivia's seat of government, is about 3,600 m high.
How many players are on a standard football (soccer) team on the pitch?|11|10|9|12|1|Each side fields 11 players including the goalkeeper.
Which blood type is known as the universal donor for red cells?|O negative|AB positive|A positive|B negative|3|O-negative red cells can be given to almost anyone.
In which sport would you perform a "slam dunk"?|Basketball|Volleyball|Tennis|Handball|1|A slam dunk forces the ball down through the hoop.
`,

  science: `
What is the centre of an atom called?|Nucleus|Electron|Proton|Orbit|1|The nucleus contains protons and neutrons.
Which particle has a negative charge?|Electron|Proton|Neutron|Photon|1|Electrons carry negative charge.
Which particle has no electric charge?|Neutron|Proton|Electron|Ion|1|Neutrons are neutral.
What force keeps us on the ground?|Gravity|Magnetism|Friction|Inertia|1|Gravity pulls masses toward each other.
What is the speed of light in a vacuum, approximately?|300,000 km per second|30,000 km per second|3,000 km per second|3 million km per second|2|About 299,792 km/s.
What is the powerhouse of the cell?|Mitochondria|Nucleus|Ribosome|Chloroplast|1|Mitochondria produce most of the cell's energy.
Which pigment makes plants green?|Chlorophyll|Melanin|Haemoglobin|Carotene|1|Chlorophyll absorbs light for photosynthesis.
What type of energy is stored in a stretched spring?|Elastic potential energy|Kinetic energy|Thermal energy|Nuclear energy|2|Stretched or compressed objects store elastic potential energy.
What is the unit of electrical resistance?|Ohm|Volt|Ampere|Watt|2|Resistance is measured in ohms (Ω).
What is the unit of force?|Newton|Joule|Pascal|Watt|2|Named after Isaac Newton.
What is the unit of energy?|Joule|Newton|Watt|Hertz|2|Energy is measured in joules.
What is the unit of frequency?|Hertz|Decibel|Watt|Tesla|2|One hertz is one cycle per second.
What is H₂O more commonly known as?|Water|Hydrogen peroxide|Salt|Ammonia|1|Two hydrogens, one oxygen.
What is the common name for sodium chloride?|Table salt|Baking soda|Chalk|Vinegar|1|NaCl is ordinary salt.
What is the chemical formula of carbon dioxide?|CO₂|CO|C₂O|O₂C₂|1|One carbon and two oxygen atoms.
What gas makes up most of Earth's atmosphere?|Nitrogen|Oxygen|Carbon dioxide|Argon|1|About 78% of air is nitrogen.
What is the pH of pure water?|7|0|14|5|2|Pure water is neutral at pH 7.
Which planet has the most prominent ring system?|Saturn|Jupiter|Uranus|Neptune|1|Saturn's rings are made of ice and rock.
How long does light from the Sun take to reach Earth, roughly?|8 minutes|8 seconds|8 hours|1 day|2|About 8 minutes 20 seconds.
What is the closest star to Earth?|The Sun|Proxima Centauri|Sirius|Polaris|1|The Sun is our nearest star.
Which planet is the hottest in our solar system?|Venus|Mercury|Mars|Jupiter|2|Venus's thick atmosphere traps heat.
What is the name of our galaxy?|Milky Way|Andromeda|Whirlpool|Sombrero|1|The Solar System sits in the Milky Way.
What do we call animals that eat only plants?|Herbivores|Carnivores|Omnivores|Insectivores|1|Herbivores feed on plants.
Which blood cells fight infection?|White blood cells|Red blood cells|Platelets|Plasma cells only|1|White blood cells are part of the immune system.
Which blood component helps clotting?|Platelets|Red blood cells|Plasma|White blood cells|2|Platelets clump together to stop bleeding.
What carries oxygen in red blood cells?|Haemoglobin|Insulin|Keratin|Collagen|2|Haemoglobin binds oxygen.
Which organ produces insulin?|Pancreas|Liver|Kidney|Stomach|2|Insulin is made by the pancreas.
What is the study of earthquakes called?|Seismology|Meteorology|Geology of stars|Volcanology|2|Seismologists study seismic waves.
What is the study of weather called?|Meteorology|Astronomy|Ecology|Oceanography|1|Meteorology is the science of the atmosphere.
Which vitamin does the skin make in sunlight?|Vitamin D|Vitamin C|Vitamin A|Vitamin B12|2|UVB light helps skin make vitamin D.
Which vitamin is abundant in citrus fruit?|Vitamin C|Vitamin D|Vitamin K|Vitamin E|1|Oranges and lemons are rich in vitamin C.
What is the process of liquid turning into gas called?|Evaporation|Condensation|Freezing|Melting|1|Evaporation turns liquid to vapour.
What is it called when a gas turns into a liquid?|Condensation|Evaporation|Sublimation|Deposition|1|Water vapour condensing forms dew.
What is it called when a solid turns directly into a gas?|Sublimation|Evaporation|Melting|Condensation|2|Dry ice sublimates.
What type of rock forms from cooled lava?|Igneous|Sedimentary|Metamorphic|Fossil|2|Igneous rock forms from molten rock.
What type of rock is formed from layers of sediment?|Sedimentary|Igneous|Metamorphic|Volcanic|2|Sandstone and limestone are sedimentary.
Which planet rotates tipped over on its side?|Uranus|Neptune|Saturn|Jupiter|3|Uranus's axis is tilted about 98 degrees.
Which scientist proposed E = mc²?|Albert Einstein|Isaac Newton|Niels Bohr|Galileo Galilei|1|Part of Einstein's special relativity.
What does DNA stand for?|Deoxyribonucleic acid|Dinitrogen acid|Dynamic nuclear acid|Deoxyribose nitrate|1|DNA carries genetic instructions.
How many chromosomes do humans typically have?|46|23|44|48|2|23 pairs, 46 in total.
What is absolute zero on the Celsius scale?|−273.15 °C|−100 °C|0 °C|−459.67 °C|3|Absolute zero is 0 kelvin, −273.15 °C.
Which metal is liquid at room temperature?|Mercury|Lead|Aluminium|Tin|1|Mercury melts at −39 °C.
Which is the lightest element?|Hydrogen|Helium|Lithium|Oxygen|1|Hydrogen has atomic number 1.
Sound travels fastest through which of these?|Steel|Air|Water|A vacuum|2|Sound moves faster in dense solids; it can't travel in a vacuum.
What is the name of the natural satellite of Earth?|The Moon|Phobos|Titan|Europa|1|Earth has one natural moon.
Which planet has a moon called Titan?|Saturn|Jupiter|Neptune|Mars|2|Titan is Saturn's largest moon.
What does a Geiger counter detect?|Radiation|Earthquakes|Sound|Magnetism|2|It measures ionising radiation.
What simple machine is a ramp?|Inclined plane|Lever|Pulley|Wedge|2|A ramp is an inclined plane.
What is the main gas released by plants during photosynthesis?|Oxygen|Carbon dioxide|Nitrogen|Methane|1|Oxygen is a by-product of photosynthesis.
How many planets are in our solar system?|8|9|7|10|1|Pluto was reclassified as a dwarf planet in 2006.
`,

  geography: `
What is the longest river in Africa?|Nile|Congo|Niger|Zambezi|1|The Nile flows north to the Mediterranean.
What is the highest mountain on Earth above sea level?|Mount Everest|K2|Kangchenjunga|Mont Blanc|1|Everest is about 8,849 m high.
Which is the largest country by area?|Russia|Canada|China|United States|1|Russia spans 11 time zones.
Which is the smallest country in the world?|Vatican City|Monaco|San Marino|Liechtenstein|1|Vatican City is about 0.44 km².
Which country has the most natural lakes?|Canada|Russia|United States|Finland|3|Canada has more lakes than the rest of the world combined.
The Andes mountain range is on which continent?|South America|Africa|Asia|North America|1|The Andes run along South America's west coast.
The Alps are mainly in which continent?|Europe|Asia|North America|Africa|1|The Alps cross France, Switzerland, Italy, Austria and more.
Which desert covers much of northern Chile?|Atacama|Sahara|Gobi|Mojave|2|The Atacama is one of the driest places on Earth.
Which ocean lies between Africa and Australia?|Indian Ocean|Pacific Ocean|Atlantic Ocean|Southern Ocean|1|The Indian Ocean.
Which strait separates Europe and Africa?|Strait of Gibraltar|Bosporus|Strait of Hormuz|Bering Strait|2|Gibraltar links the Atlantic and Mediterranean.
Which strait separates Asia and North America?|Bering Strait|Strait of Malacca|Strait of Gibraltar|Cook Strait|2|The Bering Strait lies between Russia and Alaska.
What is the largest island in the world (not a continent)?|Greenland|New Guinea|Borneo|Madagascar|1|Greenland is about 2.1 million km².
Which African country was formerly called Abyssinia?|Ethiopia|Eritrea|Somalia|Sudan|3|Abyssinia is the historical name of Ethiopia.
Which country is known as the Land of the Rising Sun?|Japan|China|South Korea|Thailand|1|Japan's name means "origin of the sun".
Which country is shaped like a boot?|Italy|Greece|Portugal|Chile|1|Italy's peninsula looks like a boot.
Which is the largest country in South America?|Brazil|Argentina|Peru|Colombia|1|Brazil covers nearly half the continent.
Which is the largest country in Africa by area?|Algeria|DR Congo|Sudan|Libya|2|Algeria has been Africa's largest since 2011.
Which lake is the largest by area in Africa?|Lake Victoria|Lake Tanganyika|Lake Malawi|Lake Chad|2|Lake Victoria borders Uganda, Kenya and Tanzania.
What is the deepest lake in the world?|Lake Baikal|Lake Superior|Lake Tanganyika|Caspian Sea|2|Baikal in Siberia is over 1,600 m deep.
Which is the largest lake in the world by area?|Caspian Sea|Lake Superior|Lake Victoria|Lake Baikal|2|Despite its name, the Caspian is a lake.
The Great Lakes lie on the border of the United States and which country?|Canada|Mexico|Russia|Greenland|1|Four of the five Great Lakes border Canada.
Which country contains the most time zones including overseas territories?|France|Russia|United States|China|3|France's territories span 12 time zones.
What is the deepest point in the world's oceans?|Mariana Trench|Puerto Rico Trench|Java Trench|Tonga Trench|1|The Challenger Deep is about 11 km down.
Which continent has the most countries?|Africa|Asia|Europe|South America|2|Africa has 54 countries.
Which is the least populated continent?|Antarctica|Oceania|South America|Europe|1|Antarctica has no permanent population.
Which river flows through Baghdad?|Tigris|Euphrates|Jordan|Nile|3|Baghdad sits on the Tigris.
Which city is built on two continents?|Istanbul|Cairo|Moscow|Athens|2|Istanbul straddles the Bosporus between Europe and Asia.
Which country has the longest coastline?|Canada|Norway|Indonesia|Australia|2|Canada's coastline exceeds 200,000 km.
Mount Kilimanjaro is in which country?|Tanzania|Kenya|Uganda|Ethiopia|1|Kilimanjaro is Africa's highest peak.
Which is the longest mountain range on land?|Andes|Himalayas|Rocky Mountains|Alps|2|The Andes stretch about 7,000 km.
Which sea is so salty that people easily float in it?|Dead Sea|Red Sea|Black Sea|Caspian Sea|1|The Dead Sea is about ten times saltier than the ocean.
The Sahara desert is on which continent?|Africa|Asia|Australia|South America|1|The Sahara spans North Africa.
Which country has the city of Marrakesh?|Morocco|Egypt|Tunisia|Algeria|2|Marrakesh is a historic Moroccan city.
Which US state is made up of islands in the Pacific?|Hawaii|Alaska|California|Florida|1|Hawaii is an island chain.
What is the name of the southernmost continent?|Antarctica|Australia|South America|Africa|1|Antarctica surrounds the South Pole.
Which line of longitude passes through Greenwich, London?|Prime meridian|Equator|International Date Line|Tropic of Capricorn|1|The prime meridian is 0° longitude.
Which country has the city of Cape Town?|South Africa|Namibia|Kenya|Australia|1|Cape Town sits beneath Table Mountain.
Which country is home to the fjords of Geirangerfjord?|Norway|Sweden|Iceland|Canada|2|Geirangerfjord is a UNESCO site in Norway.
Which two countries share the longest international border?|Canada and United States|Russia and China|Argentina and Chile|India and Bangladesh|2|About 8,900 km including Alaska.
Which is the largest rainforest in the world?|Amazon|Congo|Daintree|Borneo|1|The Amazon spans nine countries.
Which ocean is the smallest?|Arctic Ocean|Indian Ocean|Southern Ocean|Atlantic Ocean|1|The Arctic is the smallest and shallowest.
The Gobi Desert is mainly in which two countries?|Mongolia and China|India and Pakistan|Iran and Iraq|Kazakhstan and Russia|2|The Gobi spans southern Mongolia and northern China.
Which city is known as the Big Apple?|New York City|Los Angeles|Chicago|Boston|1|A nickname popularised in the 1920s.
Which city is known as the City of Light?|Paris|Rome|Vienna|Prague|1|Paris, "la Ville Lumière".
Venice is famous for canals. In which country is it?|Italy|Netherlands|Belgium|Croatia|1|Venice is in north-east Italy.
`,

  history: `
Who was the first person to walk on the Moon?|Neil Armstrong|Buzz Aldrin|Yuri Gagarin|Michael Collins|1|Armstrong stepped out on 20 July 1969.
Who was the first President of the United States?|George Washington|Abraham Lincoln|Thomas Jefferson|John Adams|1|Washington served from 1789 to 1797.
Which ancient civilisation built the pyramids of Giza?|Ancient Egyptians|Romans|Aztecs|Greeks|1|They were built around 2500 BCE.
Which empire was ruled by Julius Caesar?|Roman Republic|Greek Empire|Ottoman Empire|Persian Empire|2|Caesar led the late Roman Republic.
Who was the first emperor of Rome?|Augustus|Julius Caesar|Nero|Constantine|2|Augustus became emperor in 27 BCE.
Which city was destroyed by Mount Vesuvius in 79 CE?|Pompeii|Rome|Athens|Carthage|1|Ash preserved the Roman town of Pompeii.
Which wall was built to protect Chinese states from northern invasions?|Great Wall|Hadrian's Wall|Berlin Wall|Wall of Babylon|1|Built and rebuilt over many dynasties.
Which Roman emperor built a wall across northern Britain?|Hadrian|Augustus|Caligula|Trajan|2|Hadrian's Wall dates from 122 CE.
Who was known as the "Maid of Orléans"?|Joan of Arc|Marie Antoinette|Catherine de' Medici|Eleanor of Aquitaine|2|Joan of Arc led French forces in 1429.
Who was the French military leader crowned Emperor in 1804?|Napoleon Bonaparte|Louis XIV|Charles de Gaulle|Louis XVI|1|Napoleon crowned himself at Notre-Dame.
Which queen ruled England during the defeat of the Spanish Armada?|Elizabeth I|Victoria|Mary I|Anne|2|Elizabeth I reigned 1558–1603.
Who led India's non-violent independence movement?|Mahatma Gandhi|Jawaharlal Nehru|Subhas Chandra Bose|B. R. Ambedkar|1|Gandhi championed non-violent resistance.
Who became South Africa's first democratically elected president in 1994?|Nelson Mandela|Desmond Tutu|F. W. de Klerk|Thabo Mbeki|1|Mandela served until 1999.
Which explorer led the first expedition to sail around the world (completed 1522)?|Ferdinand Magellan|Christopher Columbus|Vasco da Gama|James Cook|2|Magellan died on the way; the voyage was completed by his crew.
Which explorer first reached India by sea from Europe around Africa?|Vasco da Gama|Marco Polo|Ferdinand Magellan|Amerigo Vespucci|2|He reached Calicut in 1498.
Which Venetian travelled to the court of Kublai Khan?|Marco Polo|Christopher Columbus|Zheng He|Ibn Battuta|2|Marco Polo's travels were written up around 1300.
Who was the famous Mongol leader who founded the Mongol Empire?|Genghis Khan|Kublai Khan|Attila|Tamerlane|1|He united the Mongol tribes in 1206.
Which ship carried the Pilgrims to North America in 1620?|Mayflower|Santa María|Endeavour|Beagle|2|The Mayflower landed at Plymouth.
Which ship carried Charles Darwin on his famous voyage?|HMS Beagle|HMS Victory|Endeavour|Golden Hind|2|The voyage lasted from 1831 to 1836.
Which pharaoh's tomb was discovered almost intact in 1922?|Tutankhamun|Ramesses II|Cleopatra|Khufu|1|Howard Carter found it in the Valley of the Kings.
The Renaissance began in which country?|Italy|France|England|Spain|1|It began in Florence in the 14th century.
Who painted the ceiling of the Sistine Chapel?|Michelangelo|Leonardo da Vinci|Raphael|Donatello|1|He painted it between 1508 and 1512.
What was the name of the ancient trade route linking China and the Mediterranean?|Silk Road|Spice Route|Amber Road|Incense Route|1|Silk was a major traded good.
Who was the Macedonian king who created a huge empire by age 30?|Alexander the Great|Philip II|Darius|Cyrus the Great|1|Alexander's empire stretched to India.
Which civilisation built Machu Picchu?|Inca|Maya|Aztec|Olmec|1|Built in the 15th century in the Andes.
Which civilisation built the city of Tenochtitlan?|Aztec|Inca|Maya|Toltec|2|Tenochtitlan is now Mexico City.
Which ancient wonder stood in the harbour of Rhodes?|The Colossus|The Lighthouse|The Hanging Gardens|The Mausoleum|3|A giant bronze statue of the sun god Helios.
Which ancient wonder was in Alexandria?|The Lighthouse (Pharos)|The Colossus|The Temple of Artemis|The Hanging Gardens|2|The Pharos of Alexandria guided ships.
Which is the only ancient Wonder of the World still largely standing?|Great Pyramid of Giza|Hanging Gardens of Babylon|Colossus of Rhodes|Statue of Zeus|1|The Great Pyramid is over 4,500 years old.
Who was the first woman to win a Nobel Prize?|Marie Curie|Mother Teresa|Rosalind Franklin|Florence Nightingale|1|She won in Physics in 1903.
Which nurse became famous during the Crimean War?|Florence Nightingale|Clara Barton|Mary Seacole|Edith Cavell|2|Known as "The Lady with the Lamp".
Who was the first woman to fly solo across the Atlantic?|Amelia Earhart|Bessie Coleman|Amy Johnson|Valentina Tereshkova|2|She flew in 1932.
Who was the first woman in space?|Valentina Tereshkova|Sally Ride|Kalpana Chawla|Mae Jemison|2|Tereshkova flew in 1963.
Which document begins "We the People"?|The US Constitution|The Magna Carta|The Declaration of Independence|The Bill of Rights|2|The preamble of the US Constitution.
Which wall divided a European city from 1961 to 1989?|Berlin Wall|Hadrian's Wall|Great Wall|Western Wall|1|It divided East and West Berlin.
Which war was fought between the North and South of the United States?|American Civil War|War of 1812|Revolutionary War|Spanish–American War|1|It lasted from 1861 to 1865.
Which ancient Greek city was famous for its warriors?|Sparta|Athens|Corinth|Thebes|1|Spartans were renowned soldiers.
Which philosopher taught Alexander the Great?|Aristotle|Plato|Socrates|Pythagoras|2|Aristotle tutored him as a teenager.
Who invented the first practical printing press in Europe?|Johannes Gutenberg|William Caxton|Leonardo da Vinci|Benjamin Franklin|1|Around 1440 in Mainz.
Which dynasty built the Forbidden City?|Ming|Qing|Han|Tang|3|It was completed in 1420 under the Ming.
Which Mughal emperor built the Taj Mahal?|Shah Jahan|Akbar|Babur|Aurangzeb|2|Built in memory of Mumtaz Mahal.
Who was the leader of the Soviet Union during most of World War II?|Joseph Stalin|Vladimir Lenin|Nikita Khrushchev|Leon Trotsky|2|Stalin led from the mid-1920s to 1953.
What was the name of the first artificial satellite, launched in 1957?|Sputnik 1|Explorer 1|Vostok 1|Apollo 1|2|Launched by the Soviet Union.
Which ancient people built Stonehenge?|Neolithic Britons|Romans|Vikings|Celts in the Iron Age|3|Construction began around 3000 BCE.
Where did the Vikings come from?|Scandinavia|Scotland|Germany|Russia|1|Modern Norway, Sweden and Denmark.
Which Egyptian queen allied with Julius Caesar and Mark Antony?|Cleopatra|Nefertiti|Hatshepsut|Nefertari|1|Cleopatra VII was the last active Ptolemaic ruler.
Who was the British prime minister for most of World War II?|Winston Churchill|Neville Chamberlain|Clement Attlee|Anthony Eden|1|Churchill led from 1940 to 1945.
The Industrial Revolution began in which country?|Great Britain|United States|Germany|France|1|It began in the late 18th century.
Which structure in Paris was built for the 1889 World's Fair?|Eiffel Tower|Arc de Triomphe|Louvre Pyramid|Notre-Dame|1|Designed by Gustave Eiffel's company.
`,

  movies: `
Which film features a great white shark terrorising Amity Island?|Jaws|The Meg|Deep Blue Sea|Open Water|1|Directed by Steven Spielberg in 1975.
In "The Wizard of Oz", what colour are Dorothy's slippers in the film?|Ruby red|Silver|Gold|Emerald green|2|They were silver in the book but ruby in the 1939 film.
Which animated film features a clownfish searching for his son?|Finding Nemo|Shark Tale|The Little Mermaid|Luca|1|Pixar, 2003.
Which studio made "Toy Story", the first fully computer-animated feature film?|Pixar|DreamWorks|Studio Ghibli|Illumination|1|Released in 1995.
Which studio made "Spirited Away"?|Studio Ghibli|Pixar|Toei Animation|Laika|1|Directed by Hayao Miyazaki.
Which studio created "Shrek"?|DreamWorks Animation|Pixar|Disney|Blue Sky|1|Released in 2001.
What is the name of the wizarding school in Harry Potter?|Hogwarts|Durmstrang|Beauxbatons|Nevermore|1|Hogwarts School of Witchcraft and Wizardry.
What is the fictional African nation in "Black Panther"?|Wakanda|Zamunda|Genovia|Latveria|1|Wakanda is home to vibranium.
Which film won the first Academy Award for Best Picture awarded to a non-English-language film?|Parasite|Roma|Amélie|Crouching Tiger, Hidden Dragon|2|Parasite won in 2020.
Which movie features the line "May the Force be with you"?|Star Wars|Star Trek|Dune|Guardians of the Galaxy|1|A classic Star Wars phrase.
Who plays Iron Man in the Marvel Cinematic Universe?|Robert Downey Jr.|Chris Evans|Chris Hemsworth|Mark Ruffalo|1|Starting with Iron Man (2008).
Which superhero is also known as the Caped Crusader?|Batman|Superman|Spider-Man|Captain America|1|Batman's nickname.
What is Superman's home planet?|Krypton|Asgard|Vulcan|Tatooine|1|Superman was sent from Krypton.
Which Disney film features the song "Let It Go"?|Frozen|Moana|Tangled|Encanto|1|Sung by Elsa in 2013.
Which Disney film features the song "Hakuna Matata"?|The Lion King|Aladdin|The Jungle Book|Tarzan|1|Sung by Timon and Pumbaa.
In "Finding Nemo", what kind of fish is Dory?|Blue tang|Clownfish|Angelfish|Pufferfish|2|Dory is a regal blue tang.
Which film series follows Dominic Toretto and his crew?|Fast & Furious|Mission: Impossible|Transformers|Need for Speed|1|The series began in 2001.
Who is the secret agent with the code number 007?|James Bond|Jason Bourne|Ethan Hunt|Jack Ryan|1|Created by Ian Fleming.
Which film is about a toy cowboy and a space ranger?|Toy Story|Cars|Monsters, Inc.|The Incredibles|1|Woody and Buzz Lightyear.
In "The Lion King", who is Simba's father?|Mufasa|Scar|Rafiki|Zazu|1|Mufasa rules the Pride Lands.
What is the name of the snowman in "Frozen"?|Olaf|Sven|Kristoff|Hans|1|Olaf loves warm hugs.
Which movie features the DeLorean time machine?|Back to the Future|The Terminator|Looper|Interstellar|1|The DeLorean needs 88 mph.
Which film is set mostly aboard a sinking ocean liner in 1912?|Titanic|Poseidon|Lusitania|Dunkirk|1|James Cameron, 1997.
Which film franchise is set in a park of cloned dinosaurs?|Jurassic Park|King Kong|Godzilla|Land of the Lost|1|Based on Michael Crichton's novel.
Which film features a young wizard named Harry and his friends Ron and Hermione?|Harry Potter|Percy Jackson|The Chronicles of Narnia|Fantastic Beasts|1|Based on J. K. Rowling's books.
Which character says "I'll be back"?|The Terminator|RoboCop|Rocky|Rambo|2|Arnold Schwarzenegger in The Terminator.
Which film features a boy and a tiger stranded on a lifeboat?|Life of Pi|Cast Away|The Jungle Book|Castaway on the Moon|1|Based on Yann Martel's novel.
Which city is the setting for Batman's adventures?|Gotham City|Metropolis|Star City|Central City|1|Gotham is Batman's home city.
Which film shows emotions like Joy and Sadness inside a girl's head?|Inside Out|Soul|Up|Coco|1|Pixar, 2015.
Which movie features the Day of the Dead and a boy named Miguel?|Coco|The Book of Life|Encanto|Soul|1|Pixar, 2017.
What award is given each year at the Cannes Film Festival's top prize?|Palme d'Or|Golden Lion|Golden Bear|Golden Globe|2|The Palme d'Or is Cannes' highest prize.
The Golden Lion is the top award of which film festival?|Venice|Berlin|Cannes|Toronto|3|The Venice Film Festival.
Which TV series is set in the fictional town of Hawkins, Indiana?|Stranger Things|Twin Peaks|Riverdale|Wednesday|1|Netflix, 2016 onwards.
Which animated TV family lives in Springfield?|The Simpsons|Family Guy|Bob's Burgers|The Flintstones|1|The Simpsons debuted in 1989.
Which TV series features six friends in New York and Central Perk café?|Friends|How I Met Your Mother|Seinfeld|New Girl|1|Aired from 1994 to 2004.
Which Korean survival drama became a Netflix global hit in 2021?|Squid Game|Kingdom|Alice in Borderland|All of Us Are Dead|1|Created by Hwang Dong-hyuk.
Which fantasy TV series features the Iron Throne?|Game of Thrones|The Witcher|The Wheel of Time|Vikings|1|Based on George R. R. Martin's novels.
In "Up", how does Carl lift his house into the sky?|Balloons|A rocket|A helicopter|Kites|1|Thousands of helium balloons.
Which film is about a robot cleaning up an abandoned Earth?|WALL-E|Robots|Big Hero 6|The Iron Giant|1|Pixar, 2008.
What is the name of the lion in "The Chronicles of Narnia"?|Aslan|Simba|Mufasa|Leo|1|Aslan is the great lion of Narnia.
`,

  music: `
How many lines are on a standard musical staff?|5|4|6|7|1|The staff has five lines and four spaces.
What does "forte" mean in music?|Loud|Soft|Fast|Slow|1|Forte (f) means loud.
What does "piano" mean as a musical instruction?|Soft|Loud|Fast|Smoothly|1|Piano (p) means soft.
What does "allegro" mean?|Fast and lively|Slow|Very soft|Getting louder|2|Allegro is a brisk tempo.
What does "crescendo" mean?|Gradually getting louder|Gradually getting softer|Slowing down|Speeding up|2|A crescendo builds volume.
How many notes are in a standard major scale (not counting the repeated top note)?|7|8|5|12|2|Do-re-mi-fa-so-la-ti.
How many semitones are in an octave?|12|8|10|7|2|The chromatic scale has 12 semitones.
Which musician was known as the "King of Pop"?|Michael Jackson|Elvis Presley|Prince|Justin Timberlake|1|Michael Jackson's nickname.
Which musician was known as the "King of Rock and Roll"?|Elvis Presley|Chuck Berry|Little Richard|Buddy Holly|1|Elvis Presley's nickname.
Which band sang "Bohemian Rhapsody"?|Queen|The Beatles|Led Zeppelin|The Who|1|Released in 1975.
Which band had a hit with "Dancing Queen"?|ABBA|Bee Gees|Boney M.|The Carpenters|1|Released in 1976.
Which Jamaican musician sang "No Woman, No Cry"?|Bob Marley|Jimmy Cliff|Peter Tosh|Sean Paul|1|Bob Marley and the Wailers.
Which composer wrote "The Four Seasons"?|Antonio Vivaldi|Johann Sebastian Bach|Wolfgang Amadeus Mozart|George Frideric Handel|1|Four violin concertos from 1720s.
Which composer continued writing music after becoming deaf?|Ludwig van Beethoven|Johann Sebastian Bach|Frédéric Chopin|Franz Schubert|1|His Ninth Symphony was composed while deaf.
Which composer wrote "The Nutcracker" ballet music?|Pyotr Ilyich Tchaikovsky|Igor Stravinsky|Sergei Prokofiev|Claude Debussy|1|First performed in 1892.
Which composer wrote "The Magic Flute" opera?|Wolfgang Amadeus Mozart|Giuseppe Verdi|Richard Wagner|Gioachino Rossini|2|Premiered in 1791.
Which instrument did jazz legend Louis Armstrong famously play?|Trumpet|Saxophone|Piano|Clarinet|1|Armstrong was a trumpet virtuoso.
Which instrument did Jimi Hendrix play?|Electric guitar|Drums|Bass|Keyboard|1|Hendrix was an electric guitar pioneer.
What are the black and white parts of a piano called?|Keys|Frets|Pedals|Hammers|1|A piano has 52 white and 36 black keys.
What is a group of four musicians called?|Quartet|Trio|Quintet|Duet|1|"Quartet" comes from the Italian for four.
What is a group of five musicians called?|Quintet|Quartet|Sextet|Octet|1|Five performers form a quintet.
Which Korean group performed "Dynamite" in 2020?|BTS|Blackpink|EXO|Stray Kids|1|BTS's first all-English single.
What style of music originated in New Orleans in the early 20th century?|Jazz|Reggae|Hip hop|Grunge|1|Jazz grew from blues and ragtime.
Reggae music originated in which country?|Jamaica|Cuba|Trinidad and Tobago|Brazil|1|Reggae emerged in the late 1960s.
Samba music is most associated with which country?|Brazil|Argentina|Cuba|Mexico|1|Samba is central to Rio's Carnival.
Tango originated in which region?|Río de la Plata (Argentina and Uruguay)|Spain|Mexico|Portugal|2|Tango emerged in Buenos Aires and Montevideo.
Flamenco is associated with which country?|Spain|Italy|Portugal|Greece|1|Flamenco comes from Andalusia.
K-pop comes from which country?|South Korea|Japan|China|Thailand|1|Korean pop music.
What is the highest female singing voice?|Soprano|Alto|Mezzo-soprano|Contralto|1|Soprano is the highest voice type.
What is the lowest male singing voice?|Bass|Tenor|Baritone|Countertenor|1|Bass is the lowest voice type.
How many strings does a standard guitar have?|6|4|5|7|1|Standard guitars have six strings.
How many strings does a standard bass guitar have?|4|6|5|3|2|Most bass guitars have four strings.
Which musical instrument has pedals and pipes and is often found in churches?|Pipe organ|Harpsichord|Piano|Harmonium|1|The pipe organ.
What do you call the person who leads an orchestra?|Conductor|Composer|Soloist|Concertmaster|1|The conductor sets the tempo.
Which singer is known as "Queen B"?|Beyoncé|Rihanna|Madonna|Britney Spears|1|Beyoncé's nickname.
Which singer is known as the "Queen of Pop"?|Madonna|Lady Gaga|Taylor Swift|Kylie Minogue|2|Madonna's nickname since the 1980s.
Which British band was known as the "Fab Four"?|The Beatles|The Rolling Stones|Queen|The Kinks|1|John, Paul, George and Ringo.
Which Beatle was the band's drummer?|Ringo Starr|George Harrison|Paul McCartney|John Lennon|2|Ringo joined in 1962.
What does "a cappella" mean?|Singing without instruments|Singing very loudly|Singing in a church|Singing in Italian|2|Voices only, no instruments.
Which famous music festival was held in 1969 on a farm in New York State?|Woodstock|Glastonbury|Coachella|Live Aid|2|Woodstock drew around 400,000 people.
`,

  sports: `
How many players are on a basketball team on the court?|5|6|7|4|1|Each team has five players on court.
How many rings are on the Olympic flag?|5|4|6|7|1|Five interlocking rings.
In which sport can you score a "try"?|Rugby|American football|Cricket|Hockey|1|Grounding the ball over the try line.
Which country has won the most FIFA World Cup titles?|Brazil|Germany|Italy|Argentina|1|Brazil has won five.
How often are the Summer Olympic Games normally held?|Every 4 years|Every 2 years|Every year|Every 5 years|1|Every four years.
In tennis, what is a score of zero called?|Love|Nil|Duck|Zero|1|"Love" means zero in tennis.
In cricket, what is a score of zero called?|Duck|Love|Blank|Nil|2|A batter out for zero scores a duck.
How many holes are played in a standard round of golf?|18|9|12|20|1|A full round is 18 holes.
What is the maximum score in a single frame of ten-pin bowling?|30|10|20|300|3|A strike followed by two more strikes scores 30 in a frame.
What is the perfect score in ten-pin bowling?|300|200|250|500|2|Twelve strikes in a row.
Which sport uses a shuttlecock?|Badminton|Squash|Table tennis|Tennis|1|Also called a birdie.
Which Grand Slam tennis tournament is played on grass?|Wimbledon|US Open|French Open|Australian Open|1|Wimbledon, London.
Which Grand Slam tennis tournament is played on clay?|French Open|Wimbledon|US Open|Australian Open|1|Roland-Garros, Paris.
How long is a marathon?|42.195 km|40 km|50 km|26.2 km|1|26.2 miles is about 42.195 km.
Which famous cycling race is held mostly in France every July?|Tour de France|Giro d'Italia|Vuelta a España|Paris–Roubaix|1|First held in 1903.
In which sport would you find a "love game"?|Tennis|Golf|Cricket|Polo|2|A game won without the opponent scoring.
Which country hosted the first FIFA World Cup in 1930?|Uruguay|Brazil|Italy|France|2|Uruguay also won it.
How many points is a touchdown worth in American football?|6|7|3|5|2|The extra point attempt follows.
Which Jamaican sprinter holds the 100 m world record?|Usain Bolt|Yohan Blake|Asafa Powell|Tyson Gay|1|9.58 seconds in 2009.
How many players are on the ice for one ice hockey team including the goalie?|6|5|7|11|2|Five skaters plus a goalie.
Which sport is played at Wimbledon?|Tennis|Cricket|Golf|Rugby|1|The Championships, Wimbledon.
Which sport uses the terms "birdie", "eagle" and "albatross"?|Golf|Badminton|Tennis|Cricket|2|Scores under par in golf.
Which martial art's name means "the gentle way"?|Judo|Karate|Taekwondo|Kung fu|3|Jū (gentle) + dō (way).
Which martial art originated in Korea?|Taekwondo|Judo|Karate|Kung fu|2|Taekwondo is Korea's national martial art.
How many minutes is a standard football (soccer) match, excluding stoppage time?|90|80|60|100|1|Two halves of 45 minutes.
In basketball, how many points is a free throw worth?|1|2|3|0|1|Each successful free throw scores one point.
What colour card does a football referee show to send a player off?|Red|Yellow|Green|Blue|1|A red card means dismissal.
Which country invented the game of cricket?|England|Australia|India|South Africa|1|Cricket developed in south-east England.
Which sport is known as "the beautiful game"?|Football (soccer)|Basketball|Tennis|Cricket|1|A nickname popularised by Pelé.
What was the birth name of the Brazilian footballer Pelé?|Edson Arantes do Nascimento|Ronaldo Nazário|Ronaldinho Gaúcho|Neymar Jr.|3|Pelé won three World Cups.
What is the maximum break in snooker (standard)?|147|155|100|180|2|15 reds with blacks, then all colours.
What is the highest score with three darts?|180|150|120|200|2|Three treble 20s.
Where did the ancient Olympic Games take place?|Olympia|Athens|Sparta|Delphi|2|In Olympia, Greece.
Which sport features the Stanley Cup?|Ice hockey|Baseball|Basketball|American football|2|The NHL championship trophy.
Which sport features the Ryder Cup?|Golf|Tennis|Sailing|Cycling|2|Europe vs United States golf.
Which sport features the Davis Cup?|Tennis|Golf|Rugby|Cricket|2|International men's team tennis.
What is the name of American football's championship game?|Super Bowl|World Series|Stanley Cup Final|Rose Bowl|1|Held each February.
Which sport's championship is the World Series?|Baseball|Basketball|American football|Ice hockey|1|MLB's championship.
In which sport do teams compete for the Webb Ellis Cup?|Rugby union|Cricket|Football (soccer)|Rugby league|2|The Rugby World Cup trophy.
Which chess piece can only move diagonally?|Bishop|Rook|Knight|King|1|Bishops stay on one colour.
Which chess piece moves in an L shape?|Knight|Bishop|Queen|Pawn|1|Two squares one way, then one at a right angle.
How many squares are on a chessboard?|64|48|81|100|1|An 8 × 8 grid.
`,

  tech: `
Who co-founded Apple with Steve Jobs and wrote much of its early hardware design?|Steve Wozniak|Bill Gates|Paul Allen|Tim Cook|1|Wozniak designed the Apple I and II.
What does "www" stand for in a website address?|World Wide Web|World Web Wide|Wide World Web|Web World Wide|1|The web was invented in 1989.
Which company developed the Android operating system (after acquiring it)?|Google|Apple|Microsoft|Samsung|1|Google bought Android Inc. in 2005.
Which company makes the iPhone?|Apple|Samsung|Google|Sony|1|The first iPhone launched in 2007.
Which company makes the Windows operating system?|Microsoft|Apple|IBM|Google|1|Windows 1.0 launched in 1985.
What is the name of Apple's desktop operating system?|macOS|Windows|Linux|Chrome OS|1|Formerly OS X.
What is the binary number 10 in decimal?|2|10|1|4|2|Binary 10 = 1×2 + 0.
What is the binary number 1111 in decimal?|15|16|11|8|3|8 + 4 + 2 + 1 = 15.
How many bits are in a byte?|8|4|16|10|1|One byte = 8 bits.
Roughly how many bytes are in a kilobyte (in the decimal sense)?|1,000|100|10,000|1,000,000|2|Kilo = one thousand.
Which programming language is named after a comedy group?|Python|Java|Ruby|Swift|2|Named after Monty Python.
Which programming language was created by Apple for iOS apps in 2014?|Swift|Kotlin|Go|Rust|2|Swift replaced Objective-C for many developers.
Which language is mainly used to style web pages?|CSS|HTML|SQL|Python|1|Cascading Style Sheets.
What does a web browser do?|Displays web pages|Stores electricity|Prints documents|Cools the computer|1|Chrome, Firefox and Safari are browsers.
What is the main circuit board in a computer called?|Motherboard|Hard drive|Power supply|Graphics card|1|It connects all the components.
Which key combination is commonly used to copy on Windows?|Ctrl + C|Ctrl + V|Ctrl + X|Ctrl + Z|1|Ctrl + V pastes.
Which key combination usually undoes the last action on Windows?|Ctrl + Z|Ctrl + Y|Ctrl + U|Ctrl + D|1|Ctrl + Z is undo.
What is the name for malicious software?|Malware|Firmware|Shareware|Freeware|1|Short for malicious software.
What is phishing?|Tricking people into revealing personal information|A type of computer fan|A way to speed up Wi-Fi|A file format|1|Fake messages that steal data.
What does "AI" stand for?|Artificial Intelligence|Automated Internet|Advanced Interface|Applied Information|1|Machines that perform tasks needing intelligence.
Who is often called the father of computer science and AI for his "imitation game" test?|Alan Turing|Charles Babbage|John von Neumann|Ada Lovelace|2|The Turing test.
Who is considered the first computer programmer?|Ada Lovelace|Grace Hopper|Alan Turing|Charles Babbage|2|She wrote notes on Babbage's Analytical Engine.
Which company created the PlayStation?|Sony|Nintendo|Microsoft|Sega|1|The first PlayStation launched in 1994.
Which company created the Xbox?|Microsoft|Sony|Nintendo|Apple|1|Launched in 2001.
Which company makes the Switch games console?|Nintendo|Sony|Microsoft|Sega|1|Launched in 2017.
Which video game features a plumber named Mario?|Super Mario Bros.|Sonic the Hedgehog|Pac-Man|Donkey Kong Country|1|Nintendo's famous plumber.
Which video game features falling blocks that form lines?|Tetris|Pac-Man|Space Invaders|Minecraft|1|Created by Alexey Pajitnov in 1984.
Which game lets players build with blocks in a world of creepers?|Minecraft|Roblox|Fortnite|Terraria|1|Released in 2011.
What is the name of the famous yellow character who eats dots in a maze?|Pac-Man|Kirby|Q*bert|Frogger|1|Released in 1980.
What does "LOL" commonly stand for online?|Laughing out loud|Lots of love|Look online later|Log off later|1|Common internet slang.
Which device converts digital data into signals for internet over phone lines, historically?|Modem|Monitor|Mouse|Scanner|2|MOdulator-DEModulator.
What does a "pixel" make up?|A digital image|A sound file|A battery|A keyboard|1|Pixels are tiny dots of colour.
What was the first widely used web browser with graphics, released in 1993?|Mosaic|Chrome|Firefox|Safari|3|NCSA Mosaic popularised the web.
What is the common name for the symbol @?|At sign|Hash|Ampersand|Asterisk|1|Used in email addresses.
What is the symbol # commonly called on social media?|Hashtag|At sign|Slash|Tilde|1|Used to tag topics.
What does "USB" help you do?|Connect devices to a computer|Cool a laptop|Browse the web faster|Charge only watches|1|Universal Serial Bus.
What is cloud storage?|Storing files on remote servers online|Storing files in the sky|A weather app|A type of USB stick|1|Files are kept on internet servers.
What is a "bug" in software?|An error in a program|A virus from insects|A new feature|A type of cable|1|The term was popularised by Grace Hopper's team.
What does GPS use to determine location?|Satellites|Radio towers only|Magnets|Undersea cables|1|A network of satellites.
What is the name of the first mass-produced personal computer by IBM in 1981?|IBM PC|Macintosh|Commodore 64|ZX Spectrum|3|The IBM Personal Computer 5150.
`,

  food: `
What is the main ingredient of hummus?|Chickpeas|Lentils|Beans|Peas|1|Blended chickpeas with tahini.
What is tofu made from?|Soybeans|Rice|Wheat|Milk|1|Curdled soy milk pressed into blocks.
What is the main ingredient of a traditional omelette?|Eggs|Flour|Milk|Cheese|1|Beaten eggs cooked in a pan.
Which fruit is known as the "king of fruits" in Southeast Asia and has a strong smell?|Durian|Mango|Jackfruit|Papaya|2|Durian is banned on some trains for its smell.
Which nut is used to make marzipan?|Almond|Hazelnut|Walnut|Cashew|2|Marzipan is almond paste and sugar.
Which spice is the most expensive by weight?|Saffron|Vanilla|Cardamom|Cinnamon|2|Saffron comes from crocus flower stigmas.
Which vegetable is used to make pickles most commonly?|Cucumber|Carrot|Onion|Pepper|1|Pickled cucumbers are the classic pickle.
What is the main ingredient in a traditional pesto?|Basil|Parsley|Spinach|Mint|1|Basil, pine nuts, garlic, cheese and oil.
What gives bread its rise?|Yeast|Salt|Sugar|Butter|1|Yeast produces carbon dioxide gas.
Which grain is used to make sushi rice?|Short-grain rice|Basmati rice|Wild rice|Quinoa|2|Sticky short-grain rice.
Which cheese is traditionally used on pizza Margherita?|Mozzarella|Cheddar|Parmesan|Feta|1|Fresh mozzarella.
Which cheese is traditionally used in a Greek salad?|Feta|Mozzarella|Brie|Gouda|1|Feta is a brined cheese.
Which cheese is known for its holes?|Emmental|Cheddar|Brie|Camembert|2|Gas bubbles form the holes.
Which fruit is dried to make raisins?|Grapes|Plums|Figs|Dates|1|Dried grapes.
Which fruit is dried to make prunes?|Plums|Grapes|Apricots|Cherries|1|Prunes are dried plums.
Which drink is made from fermented tea leaves and has a vinegar-like taste?|Kombucha|Kefir|Chai|Matcha|2|Kombucha is fermented sweet tea.
Matcha is a powdered form of which drink?|Green tea|Coffee|Cocoa|Black tea|1|Stone-ground green tea leaves.
Which country produces the most coffee?|Brazil|Colombia|Vietnam|Ethiopia|2|Brazil has led world coffee production for over a century.
Where did coffee drinking originate, according to history?|Ethiopia and Yemen|Brazil|Italy|Colombia|3|Coffee was first cultivated in Yemen with origins in Ethiopia.
Which bean is chocolate made from?|Cacao|Coffee|Vanilla|Soy|1|Cacao beans are fermented and roasted.
What is the main ingredient of guacamole?|Avocado|Pea|Cucumber|Lime|1|Mashed avocado.
Which fruit has its seeds on the outside?|Strawberry|Raspberry|Blueberry|Cherry|1|The tiny "seeds" are actually fruits called achenes.
Which vegetable is known for making people cry when chopped?|Onion|Garlic|Leek|Celery|1|Onions release an irritant gas.
Which pasta shape's name means "little tongues"?|Linguine|Penne|Fusilli|Farfalle|3|From the Italian lingua.
Which pasta shape looks like bow ties?|Farfalle|Penne|Rigatoni|Orzo|2|Farfalle means butterflies.
What is the Japanese dish of raw fish slices without rice called?|Sashimi|Sushi|Tempura|Onigiri|2|Sashimi is thinly sliced raw fish.
Which sauce is made from egg yolk, butter and lemon juice?|Hollandaise|Béchamel|Marinara|Pesto|2|Used on eggs Benedict.
What is the white sauce made from butter, flour and milk?|Béchamel|Hollandaise|Aioli|Velouté with stock|2|One of the French mother sauces.
What is the main ingredient in traditional French fries?|Potato|Sweet potato|Cassava|Carrot|1|Fried potato strips.
Which popular Italian dessert means "pick me up"?|Tiramisu|Panna cotta|Cannoli|Gelato|2|Made with coffee-soaked ladyfingers.
What type of food is Brie?|Cheese|Bread|Sausage|Wine|1|A soft French cheese.
What type of food is a baguette?|Bread|Cheese|Pastry filled with cream|Cake|1|A long, thin French loaf.
What is the main ingredient of the Middle Eastern dip baba ghanoush?|Aubergine (eggplant)|Chickpeas|Yoghurt|Beetroot|2|Roasted aubergine with tahini.
Which fruit is used to make guava jelly?|Guava|Apple|Grape|Quince|1|It's in the name!
What is the Mexican drink "agua de jamaica" made from?|Hibiscus flowers|Mango|Tamarind|Pineapple|3|Agua de jamaica is a chilled hibiscus drink.
What is wasabi traditionally made from?|A root related to horseradish|Green peppers|Seaweed|Green tea|2|Wasabia japonica rhizome.
What colour is the flesh of a ripe avocado?|Green|Orange|Red|Purple|1|Yellow-green flesh.
Which vitamin is carrots especially rich in (as beta-carotene)?|Vitamin A|Vitamin C|Vitamin D|Vitamin B12|2|The body converts beta-carotene to vitamin A.
Popcorn is made from which grain?|Corn (maize)|Wheat|Rice|Barley|1|Kernels pop when their moisture turns to steam.
Which fruit is a cross between a tangerine and a pomelo or grapefruit?|Tangelo|Kumquat|Clementine|Lime|3|Tangelos are citrus hybrids.
Honey is made by which insects?|Bees|Wasps|Ants|Butterflies|1|Honeybees produce honey from nectar.
Which cooking method uses a hot, dry oven to cook food evenly?|Baking|Boiling|Steaming|Poaching|1|Baking uses dry heat.
`,

  language: `
What is a word that means the opposite of another word called?|Antonym|Synonym|Homonym|Acronym|1|Hot and cold are antonyms.
What is a word with the same meaning as another called?|Synonym|Antonym|Homophone|Pronoun|1|Big and large are synonyms.
What do you call words that sound the same but have different meanings, like "sea" and "see"?|Homophones|Synonyms|Antonyms|Palindromes|1|They sound alike.
What is a word formed by rearranging the letters of another, like "listen" and "silent"?|Anagram|Palindrome|Acronym|Simile|1|Same letters, new order.
What type of word describes a noun?|Adjective|Verb|Adverb|Preposition|1|Adjectives describe nouns.
What type of word is "quickly"?|Adverb|Adjective|Noun|Verb|1|Adverbs often end in -ly.
What type of word is "run" in "I run every day"?|Verb|Noun|Adjective|Adverb|1|It's an action.
Which punctuation mark ends a question?|Question mark|Full stop|Comma|Exclamation mark|1|The ? symbol.
Comparing things using "like" or "as" is called what?|Simile|Metaphor|Hyperbole|Idiom|1|"As brave as a lion" is a simile.
Extreme exaggeration for effect is called what?|Hyperbole|Irony|Alliteration|Onomatopoeia|2|"I've told you a million times" is hyperbole.
A word that imitates a sound, like "buzz" or "sizzle", is an example of what?|Onomatopoeia|Alliteration|Metaphor|Oxymoron|2|The word sounds like what it describes.
Repeating the same starting sound, like "Peter Piper picked", is called what?|Alliteration|Rhyme|Assonance|Hyperbole|2|Repeated initial consonants.
A phrase combining opposites, like "deafening silence", is called what?|Oxymoron|Paradox|Simile|Pun|2|Contradictory terms together.
What does the idiom "break the ice" mean?|Start a conversation in an awkward situation|Destroy something|Go skating|Cool a drink|1|Easing social tension.
What does the idiom "piece of cake" mean?|Something very easy|A reward|A small portion|A celebration|1|An easy task.
What does "once in a blue moon" mean?|Very rarely|Every month|At night|Never|1|A blue moon is a rare second full moon in a month.
What does "hit the sack" mean?|Go to bed|Start a fight|Go shopping|Work hard|1|To go to sleep.
What does "under the weather" mean?|Feeling ill|Outside in the rain|Very happy|Feeling cold only|1|Feeling unwell.
What does "cost an arm and a leg" mean?|Very expensive|Painful|Dangerous|Cheap|1|Something costs a lot.
What does "spill the beans" mean?|Reveal a secret|Make a mess|Cook dinner|Waste money|1|To reveal information.
What does "let the cat out of the bag" mean?|Reveal a secret by mistake|Free an animal|Start a race|Go shopping|1|Accidentally reveal something.
How many letters are in the English alphabet?|26|24|28|25|1|A to Z.
How many vowels are in the English alphabet (a, e, i, o, u)?|5|6|4|7|1|Y sometimes acts as a vowel.
Which is the most common letter in English text?|E|A|T|S|2|E appears most often.
Which language is the word "kindergarten" borrowed from?|German|Dutch|French|Danish|2|"Children's garden" in German.
Which language gave English the word "ballet"?|French|Italian|Russian|Spanish|2|Borrowed from French (from Italian balletto).
Which language gave English the word "tsunami"?|Japanese|Chinese|Korean|Hawaiian|1|"Harbour wave" in Japanese.
Which language gave English the word "shampoo"?|Hindi|Arabic|Persian|Malay|2|From Hindi "champo", to press or massage.
Which language gave English the word "algebra"?|Arabic|Greek|Latin|Persian|2|From al-jabr, "reunion of broken parts".
Which language gave English the word "robot"?|Czech|Russian|German|Polish|2|From Karel Čapek's 1920 play R.U.R.
Which language gave English the word "safari"?|Swahili|Zulu|Arabic|Hindi|2|Swahili for "journey".
Which language gave English the word "pyjamas"?|Hindi / Urdu (from Persian)|French|Spanish|Arabic|3|From "pāy-jāma", leg garment.
Which language gave English the word "chocolate"?|Nahuatl (Aztec)|Spanish|French|Quechua|3|From Nahuatl via Spanish.
Which alphabet is used to write Russian?|Cyrillic|Latin|Greek|Arabic|1|Cyrillic script.
Which writing system is used for Hindi?|Devanagari|Arabic|Cyrillic|Latin|2|Devanagari script.
Which language is written in Hangul?|Korean|Japanese|Chinese|Thai|2|Hangul was created in the 15th century.
Which ancient language is still used in the names of species?|Latin|Greek only|Sanskrit|Hebrew|1|Binomial names are in Latin.
Which is the official language of Brazil?|Portuguese|Spanish|Brazilian|French|1|Brazil was a Portuguese colony.
What does "RSVP" ask you to do?|Reply to an invitation|Arrive early|Bring a gift|Dress formally|1|French "Répondez s'il vous plaît".
What does "e.g." stand for?|For example|That is|And so on|Note well|2|Latin "exempli gratia".
What does "i.e." stand for?|That is|For example|In essence|Et cetera|2|Latin "id est".
What does "etc." stand for?|And so on|For example|That is|Please note|1|Latin "et cetera".
What is a "haiku"?|A three-line Japanese poem|A Chinese dance|A type of sushi|A martial art|1|Traditionally 5-7-5 syllables.
How many lines does a sonnet traditionally have?|14|10|12|16|2|Shakespearean and Petrarchan sonnets have 14 lines.
`,

  art: `
Which art movement is Pablo Picasso associated with founding?|Cubism|Impressionism|Surrealism|Pop Art|2|Picasso and Braque developed Cubism.
Which art movement is Salvador Dalí best known for?|Surrealism|Cubism|Baroque|Minimalism|2|Dreamlike, melting imagery.
Which art movement is Claude Monet associated with?|Impressionism|Expressionism|Dada|Realism|2|Named after his painting "Impression, Sunrise".
Which art movement is Andy Warhol associated with?|Pop Art|Cubism|Futurism|Abstract Expressionism|1|Soup cans and celebrity prints.
Which Dutch artist cut off part of his own ear?|Vincent van Gogh|Rembrandt|Johannes Vermeer|Piet Mondrian|1|In 1888 in Arles.
In which museum does the Mona Lisa hang?|The Louvre|The Prado|The Uffizi|The British Museum|1|In Paris.
In which city is the Prado Museum?|Madrid|Barcelona|Lisbon|Rome|2|Spain's national art museum.
In which city is the Uffizi Gallery?|Florence|Rome|Venice|Milan|2|A Renaissance treasure house.
In which city is the Rijksmuseum?|Amsterdam|Brussels|Rotterdam|Copenhagen|2|Home of Rembrandt's Night Watch.
In which city is the Hermitage Museum?|Saint Petersburg|Moscow|Vienna|Prague|2|Founded by Catherine the Great.
Which city is home to the Museum of Modern Art (MoMA)?|New York City|Chicago|Los Angeles|London|2|Founded in 1929.
Which London gallery is home to modern art in a former power station?|Tate Modern|National Gallery|Saatchi Gallery|Victoria and Albert Museum|2|Opened in 2000.
What are the three primary colours in traditional painting?|Red, yellow and blue|Red, green and blue|Orange, green and purple|Black, white and grey|1|Traditional painter's primaries.
What is the art of beautiful handwriting called?|Calligraphy|Typography|Origami|Lithography|1|From Greek for "beautiful writing".
What is the Japanese art of paper folding called?|Origami|Ikebana|Bonsai|Kirigami|1|Folding without cutting.
What is the Japanese art of flower arranging called?|Ikebana|Origami|Bonsai|Kintsugi|2|A disciplined art form.
What is the Japanese art of repairing pottery with gold called?|Kintsugi|Raku|Sumi-e|Ikebana|3|Celebrates repair as history.
What is a painting done on wet plaster called?|Fresco|Mosaic|Tempera|Collage|2|Used in the Sistine Chapel.
What is a picture made from small pieces of coloured glass or stone called?|Mosaic|Fresco|Collage|Stencil|1|Common in Roman and Byzantine art.
What is the name for a self-portrait photo taken with a phone?|Selfie|Portrait mode|Panorama|Snapshot|1|Added to dictionaries in 2013.
What is a painting of fruit, flowers or objects called?|Still life|Landscape|Portrait|Mural|1|Objects arranged on a table.
What is a large painting on a wall called?|Mural|Miniature|Sketch|Tapestry|1|Murals can be painted or tiled.
Which famous tapestry shows the Norman conquest of England?|Bayeux Tapestry|Lady and the Unicorn|Apocalypse Tapestry|Devonshire Hunting Tapestries|2|About 70 m long.
Which ballet features the Sugar Plum Fairy?|The Nutcracker|Swan Lake|Giselle|Coppélia|1|Tchaikovsky's Christmas ballet.
Which ballet tells the story of Odette, a princess turned into a swan?|Swan Lake|The Sleeping Beauty|Giselle|Don Quixote|1|Tchaikovsky, 1877.
Which Shakespeare play features the line "To be, or not to be"?|Hamlet|Macbeth|Othello|King Lear|1|Hamlet's famous soliloquy.
Which Shakespeare play features the witches and "Double, double toil and trouble"?|Macbeth|The Tempest|Hamlet|A Midsummer Night's Dream|1|The three witches' chant.
In which city is Shakespeare's Globe theatre?|London|Stratford-upon-Avon|Oxford|Bath|2|A reconstruction opened in 1997.
Where was William Shakespeare born?|Stratford-upon-Avon|London|Oxford|Canterbury|2|Born in 1564.
Which Greek poet is credited with "The Odyssey"?|Homer|Sophocles|Plato|Virgil|1|An ancient epic.
Which Roman poet wrote "The Aeneid"?|Virgil|Ovid|Horace|Homer|2|Written about 29–19 BCE.
Which dance originates from Argentina and Uruguay?|Tango|Salsa|Flamenco|Samba|1|Born in Buenos Aires and Montevideo.
Which classical Indian dance form comes from Tamil Nadu?|Bharatanatyam|Kathak|Kathakali|Odissi|3|One of India's oldest classical dances.
Which Russian doll nests inside copies of itself?|Matryoshka|Babushka hat|Kokeshi|Pysanka|1|Nesting dolls.
What is the name of the Chinese festival featuring dragon and lion dances at New Year?|Lunar New Year (Spring Festival)|Mid-Autumn Festival|Qingming|Dragon Boat Festival|1|Marks the start of the lunar year.
Which country's carnival is famous in Rio de Janeiro?|Brazil|Argentina|Portugal|Colombia|1|Held before Lent each year.
Which colour results from mixing red and blue?|Purple|Green|Orange|Brown|1|A secondary colour.
Which colour results from mixing red and yellow?|Orange|Green|Pink|Purple|1|A secondary colour.
What do you call an artist's paint-mixing board?|Palette|Easel|Canvas|Stencil|1|Held in the hand while painting.
What is the stand that holds a canvas called?|Easel|Palette|Frame|Tripod|1|Artists work at an easel.
`,

  nature: `
What is the fastest land animal?|Cheetah|Lion|Pronghorn|Greyhound|1|Cheetahs can top 100 km/h in short bursts.
What is the largest animal ever known to have lived?|Blue whale|African elephant|Megalodon|Argentinosaurus|1|Blue whales reach 30 m.
What is the largest land animal?|African elephant|Hippopotamus|Giraffe|White rhinoceros|1|Bulls can weigh over 6 tonnes.
What is the fastest bird in a dive?|Peregrine falcon|Golden eagle|Swift|Ostrich|2|It exceeds 300 km/h in a stoop.
What is the largest bird in the world?|Ostrich|Emu|Albatross|Condor|1|Ostriches can be 2.7 m tall.
Which bird has the largest wingspan?|Wandering albatross|Andean condor|Golden eagle|Pelican|2|Up to about 3.5 m.
Which animal is known as the "king of the jungle"?|Lion|Tiger|Gorilla|Leopard|1|Although lions mostly live in savannas.
Which animal is the largest living cat species?|Tiger|Lion|Jaguar|Leopard|2|Siberian tigers are the biggest.
What do pandas mainly eat?|Bamboo|Fish|Eucalyptus|Berries|1|Bamboo makes up about 99% of their diet.
What do koalas mainly eat?|Eucalyptus leaves|Bamboo|Insects|Grass|1|Eucalyptus is toxic to most animals.
How many hearts does an octopus have?|3|1|2|8|2|Two pump blood to the gills, one to the body.
How many legs does an insect have?|6|8|4|10|1|All adult insects have six legs.
Which animal can change colour to match its surroundings?|Chameleon|Iguana|Gecko|Monitor lizard|1|Also octopuses and cuttlefish.
Which mammal lays eggs?|Platypus|Kangaroo|Koala|Hedgehog|2|Platypuses and echidnas lay eggs.
Where do kangaroos carry their young?|In a pouch|On their back|In their mouth|In a nest|1|Marsupials have pouches.
What is a group of lions called?|Pride|Pack|Herd|School|1|Prides are family groups.
Which animal is known for building dams?|Beaver|Otter|Muskrat|Badger|1|Beavers dam rivers with branches.
Which animal sleeps upside down?|Bat|Owl|Sloth|Monkey|1|Bats hang from their feet.
What is the only continent without native snakes?|Antarctica|Australia|Europe|South America|2|Too cold for reptiles.
Which tree produces acorns?|Oak|Maple|Pine|Birch|1|Acorns are oak seeds.
Which tree's leaf appears on Canada's flag?|Maple|Oak|Birch|Pine|1|The red maple leaf.
Which is the tallest type of tree in the world?|Coast redwood|Giant sequoia|Douglas fir|Baobab|2|Redwoods exceed 115 m.
Which tree species includes the largest trees by volume?|Giant sequoia|Coast redwood|Baobab|Eucalyptus|3|The General Sherman tree is a giant sequoia.
Which flower is famous for following the sun?|Sunflower|Tulip|Rose|Daisy|1|Young sunflowers track the sun.
Which plant traps and digests insects with snapping leaves?|Venus flytrap|Pitcher plant|Sundew|Cactus|1|Native to the Carolinas, USA.
Which part of the plant absorbs water from the soil?|Roots|Leaves|Flowers|Stem|1|Roots take up water and minerals.
What is the name for animals that are active at night?|Nocturnal|Diurnal|Crepuscular|Arboreal|1|Owls and bats are nocturnal.
What is the name for animals that live in trees?|Arboreal|Aquatic|Terrestrial|Nocturnal|2|Monkeys and sloths are arboreal.
What do caterpillars turn into?|Butterflies or moths|Beetles|Dragonflies|Bees|1|Through metamorphosis.
What is a baby frog called?|Tadpole|Cygnet|Joey|Leveret|1|Tadpoles live in water.
Which is the largest species of shark?|Whale shark|Great white shark|Tiger shark|Hammerhead|1|It eats plankton.
Which sea creature has eight arms?|Octopus|Squid|Starfish|Jellyfish|1|Squid have eight arms plus two tentacles.
What type of animal is a Komodo dragon?|Lizard|Snake|Crocodile|Dinosaur|1|The largest living lizard.
Which ape is the largest?|Gorilla|Orangutan|Chimpanzee|Bonobo|1|Eastern gorillas are the biggest primates.
Which animal is the closest living relative to humans?|Chimpanzee (and bonobo)|Gorilla|Orangutan|Gibbon|2|We share about 98% of our DNA.
What colour is a polar bear's skin?|Black|White|Pink|Grey|3|Black skin under translucent fur.
Which natural event is measured with the Richter scale?|Earthquakes|Hurricanes|Tornadoes|Floods|1|It measures earthquake magnitude.
What is a tropical storm called in the Atlantic when winds reach 119 km/h?|Hurricane|Typhoon|Monsoon|Tornado|2|In the north-west Pacific it's a typhoon.
What is the process by which plants make food from sunlight?|Photosynthesis|Respiration|Transpiration|Germination|1|Uses light, water and CO₂.
What is the layer of gas that protects Earth from UV rays?|Ozone layer|Troposphere|Ionosphere|Magnetosphere|2|Ozone absorbs ultraviolet light.
Which bird is a symbol of peace?|Dove|Eagle|Owl|Swan|1|Often shown with an olive branch.
Which animal has black-and-white stripes and lives in Africa?|Zebra|Okapi|Tapir|Skunk|1|Each zebra's stripes are unique.
Which big cat has spots called rosettes and climbs trees with its prey?|Leopard|Cheetah|Lion|Lynx|2|Leopards cache prey in trees.
Which marine mammal is known as the "sea cow"?|Manatee|Walrus|Seal|Sea lion|2|Manatees graze on seagrass.
How long is an elephant's pregnancy, roughly?|22 months|9 months|12 months|6 months|3|The longest of any mammal.
Which animal is famous for its black-and-white fur and lives in China?|Giant panda|Red panda|Skunk|Badger|1|A symbol of wildlife conservation.
`,
};

// Optional regional packs — only served when the locale or the player opts in.
const REGIONAL = {
  in: `
geography|Which Indian state is known as "God's Own Country"?|Kerala|Goa|Karnataka|Tamil Nadu|1|Kerala's tourism slogan.
geography|Which is the longest river flowing entirely within India?|Ganges|Godavari|Yamuna|Narmada|2|The Ganges runs about 2,500 km.
history|Who was the first Prime Minister of India?|Jawaharlal Nehru|Sardar Patel|Indira Gandhi|Lal Bahadur Shastri|1|Nehru served from 1947 to 1964.
history|Who is known as the Iron Man of India?|Sardar Vallabhbhai Patel|Bhagat Singh|Subhas Chandra Bose|Lala Lajpat Rai|1|Patel unified the princely states.
history|Who drafted most of the Indian Constitution as chair of the drafting committee?|B. R. Ambedkar|Jawaharlal Nehru|Rajendra Prasad|Sardar Patel|1|Adopted on 26 November 1949.
gk|On which date is India's Republic Day celebrated?|26 January|15 August|2 October|14 November|1|The Constitution came into effect in 1950.
gk|What is India's national animal?|Bengal tiger|Asiatic lion|Indian elephant|Peacock|1|Adopted in 1973.
gk|What is India's national bird?|Indian peafowl|Great Indian bustard|Sarus crane|Kingfisher|1|The peacock.
gk|How many spokes does the Ashoka Chakra on India's flag have?|24|12|16|32|2|The wheel sits in the flag's centre.
sports|Which Indian cricketer is known as the "Master Blaster"?|Sachin Tendulkar|Virat Kohli|MS Dhoni|Sunil Gavaskar|1|He scored 100 international centuries.
sports|Which Indian athlete won Olympic gold in javelin at Tokyo 2020?|Neeraj Chopra|Abhinav Bindra|Milkha Singh|P. T. Usha|1|India's first Olympic athletics gold.
sports|Who was India's first individual Olympic gold medallist?|Abhinav Bindra|Neeraj Chopra|Leander Paes|Rajyavardhan Rathore|2|10 m air rifle, Beijing 2008.
movies|Which Indian film won the Oscar for Best Original Song "Naatu Naatu"?|RRR|Baahubali|Lagaan|Slumdog Millionaire|1|Awarded in 2023.
movies|Which film industry is based in Mumbai?|Bollywood|Tollywood|Kollywood|Mollywood|1|Hindi-language cinema.
movies|Which actor is known as the "Badshah of Bollywood"?|Shah Rukh Khan|Salman Khan|Aamir Khan|Amitabh Bachchan|1|SRK's popular nickname.
movies|Which classic Bollywood film features Gabbar Singh?|Sholay|Deewaar|Mughal-e-Azam|Mother India|1|Released in 1975.
music|Who wrote the poem "Vande Mataram", India's national song?|Bankim Chandra Chatterjee|Rabindranath Tagore|Sarojini Naidu|Muhammad Iqbal|3|He wrote the poem in the 1870s.
music|Who wrote India's national anthem "Jana Gana Mana"?|Rabindranath Tagore|Bankim Chandra Chatterjee|Sarojini Naidu|Muhammad Iqbal|1|Tagore wrote it in Bengali.
music|Which singer was known as the "Nightingale of India"?|Lata Mangeshkar|Asha Bhosle|Shreya Ghoshal|Kishore Kumar|1|Her career spanned seven decades.
food|Which Indian city is famous for its biryani and pearls?|Hyderabad|Lucknow|Kolkata|Chennai|1|Hyderabadi dum biryani.
food|Which bread is baked in a tandoor?|Naan|Chapati|Puri|Paratha|1|Naan is cooked in a clay oven.
art|Which dance form comes from Kerala and features elaborate face make-up?|Kathakali|Kathak|Bharatanatyam|Manipuri|2|Performed with green facial paint.
art|Which city is home to the Gateway of India?|Mumbai|Delhi|Kolkata|Chennai|1|Built in 1924.
tech|Which Indian space mission landed near the Moon's south pole in 2023?|Chandrayaan-3|Mangalyaan|Chandrayaan-2|Gaganyaan|1|Landed on 23 August 2023.
tech|What is India's space agency called?|ISRO|DRDO|NASA|BARC|1|Indian Space Research Organisation.
language|Which is the most spoken language in India?|Hindi|Bengali|Telugu|Marathi|1|Hindi has the most speakers.
geography|Which is India's southernmost mainland point?|Kanyakumari|Rameswaram|Chennai|Kochi|2|Where three seas meet.
nature|Which national park is famous for the one-horned rhinoceros?|Kaziranga|Jim Corbett|Gir|Sundarbans|2|In Assam.
nature|Which forest is home to the Asiatic lion?|Gir|Sundarbans|Kaziranga|Ranthambore|2|In Gujarat.
`,
  us: `
history|Which US president issued the Emancipation Proclamation?|Abraham Lincoln|George Washington|Ulysses S. Grant|Andrew Jackson|1|Issued on 1 January 1863.
history|In which city was the Declaration of Independence signed?|Philadelphia|Boston|New York City|Washington, D.C.|1|At Independence Hall.
history|Which US state was purchased from Russia in 1867?|Alaska|Hawaii|Oregon|Washington|2|For $7.2 million.
gk|How many stars are on the US flag?|50|48|52|13|1|One for each state.
gk|How many stripes are on the US flag?|13|50|12|15|1|For the original colonies.
gk|What is the national bird of the United States?|Bald eagle|Wild turkey|Golden eagle|Robin|1|Adopted in 1782.
gk|On which date is US Independence Day?|4 July|1 July|14 July|4 June|1|Celebrating 1776.
geography|Which is the largest US state by area?|Alaska|Texas|California|Montana|1|Alaska is over twice the size of Texas.
geography|Which is the smallest US state by area?|Rhode Island|Delaware|Connecticut|Vermont|1|About 3,100 km².
geography|Which US city is known as the "Windy City"?|Chicago|Boston|Seattle|Denver|1|On Lake Michigan.
geography|Which national park was the first in the world?|Yellowstone|Yosemite|Grand Canyon|Zion|2|Established in 1872.
sports|Which basketball player was nicknamed "His Airness"?|Michael Jordan|LeBron James|Kobe Bryant|Magic Johnson|1|Six NBA titles with Chicago.
sports|Which sport is played in the NFL?|American football|Basketball|Baseball|Ice hockey|1|National Football League.
sports|Which baseball player was known as "The Bambino"?|Babe Ruth|Lou Gehrig|Joe DiMaggio|Jackie Robinson|2|Sultan of Swat.
movies|Which California district is the historic centre of the US film industry?|Hollywood|Burbank|Santa Monica|Malibu|1|The Hollywood sign dates from 1923.
music|Which city is known as the birthplace of the blues along the Mississippi Delta and home of Beale Street?|Memphis|Nashville|New Orleans|Chicago|2|Beale Street is in Memphis.
music|Which city is known as "Music City" for country music?|Nashville|Memphis|Austin|Atlanta|1|Home of the Grand Ole Opry.
food|Which US city is famous for deep-dish pizza?|Chicago|New York City|Detroit|Boston|1|Chicago-style pizza.
food|Which holiday is traditionally celebrated with roast turkey in November?|Thanksgiving|Independence Day|Memorial Day|Labor Day|1|Fourth Thursday of November.
tech|In which California region are many big tech companies based?|Silicon Valley|Silicon Beach|Research Triangle|Route 128|1|South of San Francisco.
art|Which New York museum is known as "the Met"?|Metropolitan Museum of Art|Museum of Modern Art|Guggenheim|Whitney|1|On Fifth Avenue.
nature|Which US national park has the geyser Old Faithful?|Yellowstone|Yosemite|Glacier|Olympic|1|Erupts roughly every 90 minutes.
`,
  uk: `
history|Which king had six wives?|Henry VIII|Henry VII|Edward VI|Richard III|1|He married six times between 1509 and 1543.
history|In which year did the Battle of Hastings take place?|1066|1215|1415|1666|1|William the Conqueror won.
history|Who tried to blow up Parliament in the Gunpowder Plot?|Guy Fawkes|Oliver Cromwell|Walter Raleigh|Thomas Cromwell|1|Remembered on 5 November.
gk|What is the name of the British flag?|Union Jack|St George's Cross|Saltire|Red Ensign|1|Also called the Union Flag.
gk|What is the patron saint of Scotland?|Saint Andrew|Saint George|Saint David|Saint Patrick|2|Celebrated on 30 November.
gk|What is the patron saint of Wales?|Saint David|Saint Andrew|Saint George|Saint Patrick|2|Celebrated on 1 March.
gk|Which London residence is the monarch's official home?|Buckingham Palace|Windsor Castle|Kensington Palace|Clarence House|1|The monarch's London residence.
geography|What is the highest mountain in the UK?|Ben Nevis|Snowdon (Yr Wyddfa)|Scafell Pike|Slieve Donard|1|1,345 m in Scotland.
geography|What is the longest river in the UK?|Severn|Thames|Trent|Tay|2|About 354 km.
geography|What is the capital of Wales?|Cardiff|Swansea|Newport|Bangor|1|Capital since 1955.
geography|What is the capital of Scotland?|Edinburgh|Glasgow|Aberdeen|Dundee|1|Home of Edinburgh Castle.
geography|What is the capital of Northern Ireland?|Belfast|Derry|Armagh|Newry|1|Where the Titanic was built.
sports|Which London venue hosts the FA Cup final?|Wembley Stadium|Twickenham|Lord's|The Oval|1|Rebuilt in 2007.
sports|Which London ground is known as the "Home of Cricket"?|Lord's|The Oval|Headingley|Edgbaston|2|Home of the MCC.
movies|Which fictional spy works for MI6?|James Bond|George Smiley|Jason Bourne|Harry Palmer|1|Created by Ian Fleming.
music|Which city were The Beatles from?|Liverpool|Manchester|London|Birmingham|1|They formed in 1960.
food|What is traditionally eaten with fish and chips?|Mushy peas|Baked beans|Coleslaw|Rice|2|A classic chip-shop side.
food|Which town gives its name to a famous tart with almond and jam?|Bakewell|Eccles|Chelsea|Dundee|2|The Bakewell tart.
art|Which British street artist is anonymous?|Banksy|Damien Hirst|David Hockney|Tracey Emin|1|Famous for stencils.
tech|Which British computer scientist invented the World Wide Web?|Tim Berners-Lee|Alan Turing|Charles Babbage|Demis Hassabis|1|At CERN in 1989.
nature|Which bird is often voted Britain's favourite?|Robin|Blackbird|Wren|Barn owl|2|The European robin.
language|Which dictionary is published by Oxford University Press?|Oxford English Dictionary|Collins|Chambers|Merriam-Webster|1|First published in 1884–1928.
`,
};

// state | capital  (regional generated sets)
const US_STATES = `
Alabama|Montgomery
Alaska|Juneau
Arizona|Phoenix
Arkansas|Little Rock
California|Sacramento
Colorado|Denver
Connecticut|Hartford
Delaware|Dover
Florida|Tallahassee
Georgia|Atlanta
Hawaii|Honolulu
Idaho|Boise
Illinois|Springfield
Indiana|Indianapolis
Iowa|Des Moines
Kansas|Topeka
Kentucky|Frankfort
Louisiana|Baton Rouge
Maine|Augusta
Maryland|Annapolis
Massachusetts|Boston
Michigan|Lansing
Minnesota|Saint Paul
Mississippi|Jackson
Missouri|Jefferson City
Montana|Helena
Nebraska|Lincoln
Nevada|Carson City
New Hampshire|Concord
New Jersey|Trenton
New Mexico|Santa Fe
New York|Albany
North Carolina|Raleigh
North Dakota|Bismarck
Ohio|Columbus
Oklahoma|Oklahoma City
Oregon|Salem
Pennsylvania|Harrisburg
Rhode Island|Providence
South Carolina|Columbia
South Dakota|Pierre
Tennessee|Nashville
Texas|Austin
Utah|Salt Lake City
Vermont|Montpelier
Virginia|Richmond
Washington|Olympia
West Virginia|Charleston
Wisconsin|Madison
Wyoming|Cheyenne
`;

const INDIA_STATES = `
Andhra Pradesh|Amaravati
Arunachal Pradesh|Itanagar
Assam|Dispur
Bihar|Patna
Chhattisgarh|Raipur
Goa|Panaji
Gujarat|Gandhinagar
Haryana|Chandigarh
Himachal Pradesh|Shimla
Jharkhand|Ranchi
Karnataka|Bengaluru
Kerala|Thiruvananthapuram
Madhya Pradesh|Bhopal
Maharashtra|Mumbai
Manipur|Imphal
Meghalaya|Shillong
Mizoram|Aizawl
Nagaland|Kohima
Odisha|Bhubaneswar
Punjab|Chandigarh
Rajasthan|Jaipur
Sikkim|Gangtok
Tamil Nadu|Chennai
Telangana|Hyderabad
Tripura|Agartala
Uttar Pradesh|Lucknow
Uttarakhand|Dehradun
West Bengal|Kolkata
`;

module.exports = { HANDWRITTEN, REGIONAL, US_STATES, INDIA_STATES };
