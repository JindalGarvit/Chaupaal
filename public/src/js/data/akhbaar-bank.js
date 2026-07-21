/**
 * Expanded offline/fallback Akhbaar MCQ corpus (category-wise).
 * Pre-launch SAMPLE_QUESTIONS / SAMPLE_BONUS in samples.js stay intact;
 * main.js merges this bank when Firestore daily_sets is empty.
 * Do not add unverified `link` fields (CONTENT.md).
 */
const AKHBAAR_BANK = [
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is known as the Silicon Valley of India?",
    "options": [
      "Hyderabad",
      "Bengaluru",
      "Pune",
      "Chennai"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "Bengaluru leads India tech corridor",
    "news": "Bengaluru hosts a dense cluster of IT firms, startups and research labs, earning the Silicon Valley of India nickname.",
    "explain": "Bengaluru — India's primary technology and startup hub."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The Rigveda is primarily composed in which language?",
    "options": [
      "Pali",
      "Prakrit",
      "Sanskrit",
      "Tamil"
    ],
    "correct": 2,
    "proof": 48,
    "headline": "Rigveda among world's oldest texts",
    "news": "The Rigveda, a foundational Vedic text, is composed in early Vedic Sanskrit and remains central to classical Indian literature studies.",
    "explain": "Sanskrit — specifically early Vedic Sanskrit."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which gas do plants absorb during photosynthesis?",
    "options": [
      "Oxygen",
      "Nitrogen",
      "Carbon dioxide",
      "Hydrogen"
    ],
    "correct": 2,
    "proof": 46,
    "headline": "Photosynthesis basics for classrooms",
    "news": "Green plants take in carbon dioxide and release oxygen while converting light energy into chemical energy stored as sugars.",
    "explain": "Carbon dioxide — plants use CO2 with water and light."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "What is the chemical formula of water?",
    "options": [
      "CO2",
      "H2O",
      "NaCl",
      "O2"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "H2O remains universal science fact",
    "news": "Water molecules consist of two hydrogen atoms bonded to one oxygen atom — the familiar H2O formula taught worldwide.",
    "explain": "H2O — two hydrogen, one oxygen."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which planet is closest to the Sun?",
    "options": [
      "Venus",
      "Earth",
      "Mercury",
      "Mars"
    ],
    "correct": 2,
    "proof": 46,
    "headline": "Mercury remains innermost planet",
    "news": "Mercury orbits nearest the Sun in our solar system, completing a year far faster than Earth.",
    "explain": "Mercury — closest planet to the Sun."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Who wrote the national anthem of India?",
    "options": [
      "Bankim Chandra Chatterjee",
      "Rabindranath Tagore",
      "Sarojini Naidu",
      "Subramania Bharati"
    ],
    "correct": 1,
    "proof": 43,
    "headline": "Tagore's Jana Gana Mana",
    "news": "Rabindranath Tagore wrote Jana Gana Mana, adopted as India's national anthem.",
    "explain": "Rabindranath Tagore."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which organ pumps blood throughout the human body?",
    "options": [
      "Lungs",
      "Liver",
      "Heart",
      "Kidney"
    ],
    "correct": 2,
    "proof": 71,
    "headline": "Heart is the circulatory pump",
    "news": "The heart continuously pumps blood through arteries and veins, delivering oxygen and nutrients.",
    "explain": "Heart."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "What is the capital of Australia?",
    "options": [
      "Sydney",
      "Melbourne",
      "Canberra",
      "Perth"
    ],
    "correct": 2,
    "proof": 61,
    "headline": "Canberra is Australia's capital",
    "news": "Canberra was purpose-built as Australia's capital between Sydney and Melbourne.",
    "explain": "Canberra — not Sydney."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which vitamin is primarily produced when skin is exposed to sunlight?",
    "options": [
      "Vitamin A",
      "Vitamin B12",
      "Vitamin C",
      "Vitamin D"
    ],
    "correct": 3,
    "proof": 44,
    "headline": "Sunlight and Vitamin D",
    "news": "UV exposure helps the skin synthesize Vitamin D, important for bone health.",
    "explain": "Vitamin D."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The Great Barrier Reef is located off the coast of which country?",
    "options": [
      "Indonesia",
      "Australia",
      "Philippines",
      "Fiji"
    ],
    "correct": 1,
    "proof": 69,
    "headline": "Great Barrier Reef off Australia",
    "news": "The world's largest coral reef system lies off Queensland, Australia.",
    "explain": "Australia."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Indian festival is known as the festival of lights?",
    "options": [
      "Holi",
      "Diwali",
      "Navratri",
      "Pongal"
    ],
    "correct": 1,
    "proof": 47,
    "headline": "Diwali — festival of lights",
    "news": "Diwali celebrates light over darkness with lamps, sweets and family gatherings across India.",
    "explain": "Diwali."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "What is the smallest prime number?",
    "options": [
      "0",
      "1",
      "2",
      "3"
    ],
    "correct": 2,
    "proof": 41,
    "headline": "2 is the smallest prime",
    "news": "A prime has exactly two distinct positive divisors; 2 is the smallest and only even prime.",
    "explain": "2."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which blood group is considered the universal donor for red cells?",
    "options": [
      "A+",
      "B+",
      "AB+",
      "O-"
    ],
    "correct": 3,
    "proof": 65,
    "headline": "O-negative universal donor",
    "news": "People with O-negative blood are often called universal donors for red-cell transfusions.",
    "explain": "O-."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Mount Everest lies on the border of Nepal and which region?",
    "options": [
      "Bhutan",
      "Tibet (China)",
      "India's Sikkim",
      "Pakistan"
    ],
    "correct": 1,
    "proof": 42,
    "headline": "Everest on Nepal–Tibet border",
    "news": "The world's highest peak stands on the Nepal–Tibet (China) border in the Himalayas.",
    "explain": "Tibet (China)."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which instrument measures atmospheric pressure?",
    "options": [
      "Thermometer",
      "Barometer",
      "Hygrometer",
      "Anemometer"
    ],
    "correct": 1,
    "proof": 63,
    "headline": "Barometer for pressure",
    "news": "A barometer measures atmospheric pressure and is used in weather forecasting.",
    "explain": "Barometer."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The currency of Japan is the?",
    "options": [
      "Yuan",
      "Won",
      "Yen",
      "Ringgit"
    ],
    "correct": 2,
    "proof": 67,
    "headline": "Yen is Japan's currency",
    "news": "Japan's official currency is the yen, one of the world's major traded currencies.",
    "explain": "Yen."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state is the largest by area?",
    "options": [
      "Maharashtra",
      "Madhya Pradesh",
      "Rajasthan",
      "Uttar Pradesh"
    ],
    "correct": 2,
    "proof": 57,
    "headline": "Rajasthan is largest by area",
    "news": "Rajasthan is India's largest state by geographical area.",
    "explain": "Rajasthan."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Who discovered penicillin?",
    "options": [
      "Louis Pasteur",
      "Alexander Fleming",
      "Marie Curie",
      "Edward Jenner"
    ],
    "correct": 1,
    "proof": 51,
    "headline": "Fleming and penicillin",
    "news": "Alexander Fleming's 1928 observation led to penicillin, transforming infectious-disease treatment.",
    "explain": "Alexander Fleming."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which is the longest river in India?",
    "options": [
      "Yamuna",
      "Godavari",
      "Ganga",
      "Narmada"
    ],
    "correct": 2,
    "proof": 66,
    "headline": "Ganga is India's longest river",
    "news": "The Ganga is widely regarded as India's longest river, sacred and economically vital.",
    "explain": "Ganga."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "HTML is primarily used for?",
    "options": [
      "Database queries",
      "Styling pages",
      "Structuring web pages",
      "Compiling apps"
    ],
    "correct": 2,
    "proof": 57,
    "headline": "HTML structures the web",
    "news": "HTML marks up the structure and content of web pages in browsers.",
    "explain": "Structuring web pages."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which animal is India's national animal?",
    "options": [
      "Lion",
      "Tiger",
      "Elephant",
      "Peacock"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "Tiger is national animal",
    "news": "The Bengal tiger is India's national animal, symbolising strength and wildlife heritage.",
    "explain": "Tiger."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Sound travels fastest through which of these?",
    "options": [
      "Air",
      "Water",
      "Vacuum",
      "Steel"
    ],
    "correct": 3,
    "proof": 56,
    "headline": "Sound fastest in solids",
    "news": "Sound waves generally travel faster in denser solids like steel than in air or water.",
    "explain": "Steel."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The ozone layer protects Earth from excess?",
    "options": [
      "Infrared heat",
      "Ultraviolet radiation",
      "Microwaves",
      "Radio waves"
    ],
    "correct": 1,
    "proof": 60,
    "headline": "Ozone shields UV",
    "news": "Stratospheric ozone absorbs much of the Sun's harmful ultraviolet radiation.",
    "explain": "Ultraviolet radiation."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Mughal emperor built the Taj Mahal?",
    "options": [
      "Akbar",
      "Jahangir",
      "Shah Jahan",
      "Aurangzeb"
    ],
    "correct": 2,
    "proof": 59,
    "headline": "Shah Jahan built Taj Mahal",
    "news": "Shah Jahan commissioned the Taj Mahal in Agra as a mausoleum for Mumtaz Mahal.",
    "explain": "Shah Jahan."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "What does CPU stand for?",
    "options": [
      "Central Processing Unit",
      "Computer Personal Utility",
      "Core Power Unit",
      "Central Program Utility"
    ],
    "correct": 0,
    "proof": 50,
    "headline": "CPU is the computer brain",
    "news": "The Central Processing Unit executes instructions and coordinates system operations.",
    "explain": "Central Processing Unit."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which ocean lies to the south of India?",
    "options": [
      "Atlantic",
      "Arctic",
      "Pacific",
      "Indian Ocean"
    ],
    "correct": 3,
    "proof": 62,
    "headline": "Indian Ocean south of India",
    "news": "India's southern coastline opens onto the Indian Ocean.",
    "explain": "Indian Ocean."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The speed of light is approximately?",
    "options": [
      "3×10^5 km/s",
      "3×10^8 m/s",
      "300 m/s",
      "3×10^3 km/h"
    ],
    "correct": 1,
    "proof": 72,
    "headline": "Speed of light constant",
    "news": "In vacuum, light travels about 3×10^8 metres per second.",
    "explain": "3×10^8 m/s."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which dance form originated in Kerala?",
    "options": [
      "Kathak",
      "Bharatanatyam",
      "Kathakali",
      "Odissi"
    ],
    "correct": 2,
    "proof": 50,
    "headline": "Kathakali from Kerala",
    "news": "Kathakali is a classical dance-drama tradition from Kerala known for elaborate makeup.",
    "explain": "Kathakali."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Who is known as the Father of the Indian Constitution?",
    "options": [
      "Jawaharlal Nehru",
      "B.R. Ambedkar",
      "Sardar Patel",
      "Rajendra Prasad"
    ],
    "correct": 1,
    "proof": 49,
    "headline": "Ambedkar led drafting",
    "news": "Dr B.R. Ambedkar chaired the Drafting Committee of India's Constitution.",
    "explain": "B.R. Ambedkar."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which metal is liquid at room temperature?",
    "options": [
      "Sodium",
      "Mercury",
      "Aluminium",
      "Zinc"
    ],
    "correct": 1,
    "proof": 41,
    "headline": "Mercury is liquid metal",
    "news": "Mercury is a metal that remains liquid at standard room temperature.",
    "explain": "Mercury."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The primary gas in Earth's atmosphere is?",
    "options": [
      "Oxygen",
      "Carbon dioxide",
      "Nitrogen",
      "Argon"
    ],
    "correct": 2,
    "proof": 45,
    "headline": "Nitrogen dominates air",
    "news": "Nitrogen makes up roughly 78% of Earth's atmosphere by volume.",
    "explain": "Nitrogen."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Indian scientist won the Nobel Prize in Physics in 1930?",
    "options": [
      "Homi Bhabha",
      "C.V. Raman",
      "S.N. Bose",
      "Meghnad Saha"
    ],
    "correct": 1,
    "proof": 55,
    "headline": "C.V. Raman's Nobel",
    "news": "C.V. Raman received the 1930 Nobel Prize for work on light scattering (Raman effect).",
    "explain": "C.V. Raman."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "A leap year has how many days?",
    "options": [
      "364",
      "365",
      "366",
      "367"
    ],
    "correct": 2,
    "proof": 65,
    "headline": "Leap years have 366 days",
    "news": "Leap years insert an extra day (29 February), making 366 days.",
    "explain": "366."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which is the hardest natural substance?",
    "options": [
      "Gold",
      "Iron",
      "Diamond",
      "Quartz"
    ],
    "correct": 2,
    "proof": 56,
    "headline": "Diamond is hardest natural",
    "news": "Diamond ranks highest on the Mohs hardness scale among natural materials.",
    "explain": "Diamond."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The Ajanta caves are famous for?",
    "options": [
      "Marble tombs",
      "Buddhist paintings",
      "Naval forts",
      "Tea gardens"
    ],
    "correct": 1,
    "proof": 42,
    "headline": "Ajanta's Buddhist murals",
    "news": "Ajanta caves in Maharashtra are renowned for ancient Buddhist murals and sculptures.",
    "explain": "Buddhist paintings."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which device converts AC to DC?",
    "options": [
      "Transformer",
      "Rectifier",
      "Amplifier",
      "Oscillator"
    ],
    "correct": 1,
    "proof": 66,
    "headline": "Rectifier converts AC→DC",
    "news": "A rectifier converts alternating current into direct current.",
    "explain": "Rectifier."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "India's first Nobel laureate in Literature was?",
    "options": [
      "R.K. Narayan",
      "Rabindranath Tagore",
      "Mulk Raj Anand",
      "Sarojini Naidu"
    ],
    "correct": 1,
    "proof": 53,
    "headline": "Tagore's Literature Nobel",
    "news": "Rabindranath Tagore won the 1913 Nobel Prize in Literature.",
    "explain": "Rabindranath Tagore."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which part of the plant conducts photosynthesis mainly?",
    "options": [
      "Roots",
      "Stem",
      "Leaves",
      "Flowers"
    ],
    "correct": 2,
    "proof": 59,
    "headline": "Leaves host photosynthesis",
    "news": "Chloroplast-rich leaves are the main sites of photosynthesis in most plants.",
    "explain": "Leaves."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The Tropic of Cancer passes through how many Indian states?",
    "options": [
      "5",
      "6",
      "8",
      "10"
    ],
    "correct": 2,
    "proof": 51,
    "headline": "Tropic of Cancer through 8 states",
    "news": "The Tropic of Cancer crosses eight Indian states from Gujarat to Mizoram.",
    "explain": "8."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which is the largest mammal?",
    "options": [
      "African elephant",
      "Blue whale",
      "Giraffe",
      "Hippopotamus"
    ],
    "correct": 1,
    "proof": 43,
    "headline": "Blue whale is largest",
    "news": "The blue whale is the largest animal known to have ever lived.",
    "explain": "Blue whale."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Who invented the telephone?",
    "options": [
      "Thomas Edison",
      "Alexander Graham Bell",
      "Nikola Tesla",
      "Guglielmo Marconi"
    ],
    "correct": 1,
    "proof": 40,
    "headline": "Bell and the telephone",
    "news": "Alexander Graham Bell is credited with inventing the practical telephone.",
    "explain": "Alexander Graham Bell."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Indian river is called Dakshin Ganga?",
    "options": [
      "Krishna",
      "Kaveri",
      "Godavari",
      "Tungabhadra"
    ],
    "correct": 2,
    "proof": 57,
    "headline": "Godavari as Dakshin Ganga",
    "news": "The Godavari is often called Dakshin Ganga for its length and cultural importance in the south.",
    "explain": "Godavari."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "What does DNA stand for?",
    "options": [
      "Deoxyribonucleic acid",
      "Dynamic nuclear acid",
      "Dextrose nucleic acid",
      "Dual nucleotide assembly"
    ],
    "correct": 0,
    "proof": 51,
    "headline": "DNA carries genetic code",
    "news": "DNA (deoxyribonucleic acid) stores genetic instructions in living organisms.",
    "explain": "Deoxyribonucleic acid."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which freedom movement slogan is associated with Netaji?",
    "options": [
      "Inquilab Zindabad",
      "Jai Hind",
      "Do or Die",
      "Quit India"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "Jai Hind and Netaji",
    "news": "\"Jai Hind\" is strongly associated with Subhas Chandra Bose and the INA era.",
    "explain": "Jai Hind."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The SI unit of force is?",
    "options": [
      "Joule",
      "Watt",
      "Newton",
      "Pascal"
    ],
    "correct": 2,
    "proof": 53,
    "headline": "Newton is SI force unit",
    "news": "Force is measured in newtons in the International System of Units.",
    "explain": "Newton."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state produces the most tea?",
    "options": [
      "Kerala",
      "Assam",
      "Tamil Nadu",
      "West Bengal"
    ],
    "correct": 1,
    "proof": 66,
    "headline": "Assam leads tea output",
    "news": "Assam is India's largest tea-producing state by volume.",
    "explain": "Assam."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Binary number system uses which digits?",
    "options": [
      "0 and 1",
      "0–7",
      "0–9",
      "1–10"
    ],
    "correct": 0,
    "proof": 74,
    "headline": "Binary uses 0 and 1",
    "news": "Computers represent data in binary using bits valued 0 or 1.",
    "explain": "0 and 1."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which is India's national aquatic animal?",
    "options": [
      "Ganges river dolphin",
      "Olive ridley turtle",
      "Saltwater crocodile",
      "Hilsa"
    ],
    "correct": 0,
    "proof": 49,
    "headline": "Ganges river dolphin",
    "news": "The Ganges river dolphin is India's national aquatic animal.",
    "explain": "Ganges river dolphin."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Photosynthesis occurs in which cell organelle?",
    "options": [
      "Mitochondria",
      "Chloroplast",
      "Nucleus",
      "Ribosome"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Chloroplasts run photosynthesis",
    "news": "Chloroplasts contain chlorophyll and carry out photosynthesis in plant cells.",
    "explain": "Chloroplast."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city hosted the 1982 Asian Games?",
    "options": [
      "Mumbai",
      "Kolkata",
      "New Delhi",
      "Chennai"
    ],
    "correct": 2,
    "proof": 43,
    "headline": "Delhi hosted 1982 Asiad",
    "news": "New Delhi hosted the 1982 Asian Games, a landmark multi-sport event for India.",
    "explain": "New Delhi."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The study of earthquakes is called?",
    "options": [
      "Seismology",
      "Ecology",
      "Geomorphology",
      "Hydrology"
    ],
    "correct": 0,
    "proof": 64,
    "headline": "Seismology studies quakes",
    "news": "Seismology is the scientific study of earthquakes and seismic waves.",
    "explain": "Seismology."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which acid is found in lemon juice?",
    "options": [
      "Sulphuric acid",
      "Citric acid",
      "Nitric acid",
      "Acetic acid"
    ],
    "correct": 1,
    "proof": 56,
    "headline": "Citric acid in lemons",
    "news": "Lemons are rich in citric acid, giving them a sour taste.",
    "explain": "Citric acid."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Who was the first woman Prime Minister of India?",
    "options": [
      "Indira Gandhi",
      "Sarojini Naidu",
      "Pratibha Patil",
      "Sushma Swaraj"
    ],
    "correct": 0,
    "proof": 65,
    "headline": "Indira Gandhi first woman PM",
    "news": "Indira Gandhi became India's first woman Prime Minister in 1966.",
    "explain": "Indira Gandhi."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "Which layer of Earth do we live on?",
    "options": [
      "Mantle",
      "Core",
      "Crust",
      "Asthenosphere"
    ],
    "correct": 2,
    "proof": 64,
    "headline": "Crust is Earth's outer layer",
    "news": "Humans live on Earth's crust, the thin outermost solid layer.",
    "explain": "Crust."
  },
  {
    "category": "GK",
    "personal": false,
    "sound": "default",
    "q": "The national song of India is?",
    "options": [
      "Jana Gana Mana",
      "Vande Mataram",
      "Sare Jahan Se Achha",
      "Ae Mere Watan"
    ],
    "correct": 1,
    "proof": 65,
    "headline": "Vande Mataram is national song",
    "news": "Vande Mataram is India's national song; Jana Gana Mana is the national anthem.",
    "explain": "Vande Mataram."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "How many players are on the field for one cricket team at a time?",
    "options": [
      "9",
      "10",
      "11",
      "12"
    ],
    "correct": 2,
    "proof": 47,
    "headline": "Eleven play cricket",
    "news": "A standard cricket side fields 11 players at a time.",
    "explain": "11."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which country won the FIFA World Cup in 2022?",
    "options": [
      "France",
      "Argentina",
      "Brazil",
      "Germany"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Argentina won Qatar 2022",
    "news": "Argentina defeated France on penalties to win the 2022 FIFA World Cup in Qatar.",
    "explain": "Argentina."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "In badminton, a point is scored when?",
    "options": [
      "Serve hits net",
      "Shuttle lands in opponent court",
      "Player touches net",
      "Racket breaks"
    ],
    "correct": 1,
    "proof": 50,
    "headline": "Shuttle in court scores",
    "news": "A rally ends and a point is won when the shuttlecock lands in the opponent's court.",
    "explain": "Shuttle lands in opponent court."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian cricketer is nicknamed the Hitman?",
    "options": [
      "Virat Kohli",
      "Rohit Sharma",
      "MS Dhoni",
      "Shubman Gill"
    ],
    "correct": 1,
    "proof": 49,
    "headline": "Rohit Sharma — Hitman",
    "news": "Rohit Sharma is widely known as the Hitman for his explosive batting.",
    "explain": "Rohit Sharma."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "The Olympics are held every how many years?",
    "options": [
      "2",
      "3",
      "4",
      "5"
    ],
    "correct": 2,
    "proof": 65,
    "headline": "Olympics every four years",
    "news": "The Summer and Winter Olympics each follow a four-year cycle.",
    "explain": "4."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "How long is a standard football (soccer) match before stoppage?",
    "options": [
      "60 minutes",
      "80 minutes",
      "90 minutes",
      "120 minutes"
    ],
    "correct": 2,
    "proof": 41,
    "headline": "Football's 90 minutes",
    "news": "A regulation football match is 90 minutes plus stoppage time.",
    "explain": "90 minutes."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which sport uses a shuttlecock?",
    "options": [
      "Tennis",
      "Squash",
      "Badminton",
      "Table tennis"
    ],
    "correct": 2,
    "proof": 62,
    "headline": "Shuttlecock in badminton",
    "news": "Badminton is played with a shuttlecock (birdie) and rackets.",
    "explain": "Badminton."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Sachin Tendulkar scored how many international centuries?",
    "options": [
      "49",
      "51",
      "100",
      "116"
    ],
    "correct": 2,
    "proof": 49,
    "headline": "Tendulkar's 100 centuries",
    "news": "Sachin Tendulkar is the only player with 100 international centuries.",
    "explain": "100."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Which city hosted the 2016 Summer Olympics?",
    "options": [
      "London",
      "Rio de Janeiro",
      "Tokyo",
      "Beijing"
    ],
    "correct": 1,
    "proof": 42,
    "headline": "Rio 2016 Olympics",
    "news": "Rio de Janeiro hosted the 2016 Summer Olympic Games.",
    "explain": "Rio de Janeiro."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "In chess, which piece can jump over others?",
    "options": [
      "Bishop",
      "Knight",
      "Rook",
      "Queen"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "Knight jumps in chess",
    "news": "The knight is the only chess piece that jumps over intervening pieces.",
    "explain": "Knight."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Hockey World Cup winners receive the trophy named after?",
    "options": [
      "Thomas Cup",
      "Jules Rimet",
      "not a single private name always",
      "Davis Cup"
    ],
    "correct": 2,
    "proof": 40,
    "headline": "FIH World Cup trophy",
    "news": "The FIH Men's Hockey World Cup awards its own championship trophy (not Thomas/Davis).",
    "explain": "not a single private name always."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian won Olympic gold in javelin at Tokyo 2020?",
    "options": [
      "Neeraj Chopra",
      "Bajrang Punia",
      "PV Sindhu",
      "Mirabai Chanu"
    ],
    "correct": 0,
    "proof": 45,
    "headline": "Neeraj Chopra Olympic gold",
    "news": "Neeraj Chopra won India's Olympic gold in men's javelin at Tokyo 2020.",
    "explain": "Neeraj Chopra."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "A basketball team plays with how many players on court?",
    "options": [
      "4",
      "5",
      "6",
      "7"
    ],
    "correct": 1,
    "proof": 69,
    "headline": "Five on basketball court",
    "news": "Each basketball team has five players on the court at a time.",
    "explain": "5."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Wimbledon is played primarily on which surface?",
    "options": [
      "Clay",
      "Grass",
      "Hard court",
      "Carpet"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "Wimbledon on grass",
    "news": "The Championships at Wimbledon are famous for grass courts.",
    "explain": "Grass."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which country is famous for sumo wrestling?",
    "options": [
      "China",
      "Korea",
      "Japan",
      "Mongolia"
    ],
    "correct": 2,
    "proof": 58,
    "headline": "Sumo rooted in Japan",
    "news": "Sumo is Japan's traditional full-contact wrestling sport.",
    "explain": "Japan."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "IPL stands for?",
    "options": [
      "Indian Premier League",
      "International Players League",
      "India Power League",
      "Indian Professional League"
    ],
    "correct": 0,
    "proof": 73,
    "headline": "Indian Premier League",
    "news": "The IPL is India's premier T20 cricket franchise league.",
    "explain": "Indian Premier League."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "In tennis, 40–40 is called?",
    "options": [
      "Advantage",
      "Deuce",
      "Match point",
      "Break"
    ],
    "correct": 1,
    "proof": 49,
    "headline": "Deuce at 40–40",
    "news": "When both players reach 40, the score is called deuce.",
    "explain": "Deuce."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which martial art originated in India?",
    "options": [
      "Karate",
      "Kalaripayattu",
      "Taekwondo",
      "Judo"
    ],
    "correct": 1,
    "proof": 63,
    "headline": "Kalaripayattu from Kerala",
    "news": "Kalaripayattu is an ancient martial art tradition associated with Kerala.",
    "explain": "Kalaripayattu."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "The term \"hat-trick\" originally became popular in?",
    "options": [
      "Football",
      "Cricket",
      "Hockey",
      "Rugby"
    ],
    "correct": 1,
    "proof": 55,
    "headline": "Hat-trick from cricket",
    "news": "\"Hat-trick\" originated in cricket for three wickets in consecutive deliveries.",
    "explain": "Cricket."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian footballer is often called Captain Fantastic historically?",
    "options": [
      "Sunil Chhetri",
      "Bhaichung Bhutia",
      "IM Vijayan",
      "Gurpreet Singh"
    ],
    "correct": 0,
    "proof": 55,
    "headline": "Sunil Chhetri's captaincy era",
    "news": "Sunil Chhetri led India for years and is the country's all-time top scorer.",
    "explain": "Sunil Chhetri."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Tour de France is a famous race in?",
    "options": [
      "Cycling",
      "Skiing",
      "Motor racing",
      "Swimming"
    ],
    "correct": 0,
    "proof": 48,
    "headline": "Tour de France cycling",
    "news": "The Tour de France is the world's most famous multi-stage cycling race.",
    "explain": "Cycling."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "How many rings are on the Olympic flag?",
    "options": [
      "3",
      "4",
      "5",
      "6"
    ],
    "correct": 2,
    "proof": 44,
    "headline": "Five Olympic rings",
    "news": "The Olympic symbol has five interlocking rings representing united continents.",
    "explain": "5."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which sport is associated with the term \"love\" for zero?",
    "options": [
      "Cricket",
      "Tennis",
      "Golf",
      "Boxing"
    ],
    "correct": 1,
    "proof": 67,
    "headline": "Love means zero in tennis",
    "news": "In tennis scoring, \"love\" means a score of zero.",
    "explain": "Tennis."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Kabaddi is traditionally popular in?",
    "options": [
      "South America",
      "India and South Asia",
      "Scandinavia",
      "West Africa"
    ],
    "correct": 1,
    "proof": 68,
    "headline": "Kabaddi across South Asia",
    "news": "Kabaddi is a traditional contact sport widely played across India and South Asia.",
    "explain": "India and South Asia."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Which Formula 1 driver is a seven-time world champion (tied record era)?",
    "options": [
      "Sebastian Vettel",
      "Lewis Hamilton",
      "Max Verstappen",
      "Fernando Alonso"
    ],
    "correct": 1,
    "proof": 62,
    "headline": "Hamilton's seven titles",
    "news": "Lewis Hamilton won seven Formula 1 World Championships (tied with Schumacher).",
    "explain": "Lewis Hamilton."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "A standard golf course has how many holes?",
    "options": [
      "9",
      "12",
      "18",
      "24"
    ],
    "correct": 2,
    "proof": 61,
    "headline": "18-hole golf course",
    "news": "A full-size golf course typically has 18 holes.",
    "explain": "18."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state is strongly associated with polo heritage?",
    "options": [
      "Kerala",
      "Rajasthan",
      "Goa",
      "Sikkim"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Polo heritage in Rajasthan",
    "news": "Rajasthan has a deep historical association with polo and royal sporting traditions.",
    "explain": "Rajasthan."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "The Ashoka Chakra on India's flag has how many spokes?",
    "options": [
      "12",
      "18",
      "24",
      "36"
    ],
    "correct": 2,
    "proof": 55,
    "headline": "24 spokes on Ashoka Chakra",
    "news": "The Ashoka Chakra at the centre of India's flag has 24 spokes.",
    "explain": "24."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Which cricket format lasts up to 5 days?",
    "options": [
      "T20",
      "ODI",
      "Test",
      "The Hundred"
    ],
    "correct": 2,
    "proof": 73,
    "headline": "Test cricket up to 5 days",
    "news": "Test matches are the longest format, scheduled over up to five days.",
    "explain": "Test."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "PV Sindhu is associated with which sport?",
    "options": [
      "Tennis",
      "Badminton",
      "Boxing",
      "Shooting"
    ],
    "correct": 1,
    "proof": 60,
    "headline": "Sindhu — badminton star",
    "news": "PV Sindhu is an Olympic-medallist Indian badminton player.",
    "explain": "Badminton."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "The FIFA World Cup trophy is awarded in?",
    "options": [
      "Football",
      "Rugby",
      "Hockey",
      "Cricket"
    ],
    "correct": 0,
    "proof": 51,
    "headline": "FIFA World Cup — football",
    "news": "The FIFA World Cup is the premier men's football championship.",
    "explain": "Football."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is home to Eden Gardens?",
    "options": [
      "Mumbai",
      "Kolkata",
      "Chennai",
      "Delhi"
    ],
    "correct": 1,
    "proof": 70,
    "headline": "Eden Gardens in Kolkata",
    "news": "Eden Gardens is a historic cricket stadium in Kolkata.",
    "explain": "Kolkata."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "A marathon is approximately how many kilometres?",
    "options": [
      "21.1",
      "36.5",
      "42.2",
      "50"
    ],
    "correct": 2,
    "proof": 56,
    "headline": "Marathon ~42.2 km",
    "news": "A full marathon distance is 42.195 kilometres.",
    "explain": "42.2."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which sport uses the term \"checkmate\"?",
    "options": [
      "Ludo",
      "Chess",
      "Carrom",
      "Bridge"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "Checkmate ends chess",
    "news": "Checkmate is the winning condition in chess when the king cannot escape attack.",
    "explain": "Chess."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Mary Kom is famous for?",
    "options": [
      "Wrestling",
      "Boxing",
      "Weightlifting",
      "Archery"
    ],
    "correct": 1,
    "proof": 65,
    "headline": "Mary Kom — boxing legend",
    "news": "M.C. Mary Kom is India's celebrated Olympic-medallist boxer.",
    "explain": "Boxing."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which country invented table tennis?",
    "options": [
      "China",
      "England",
      "Japan",
      "USA"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "Table tennis began in England",
    "news": "Table tennis originated as an indoor tennis adaptation in England.",
    "explain": "England."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Dhyan Chand is associated with?",
    "options": [
      "Cricket",
      "Hockey",
      "Football",
      "Athletics"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "Dhyan Chand — hockey great",
    "news": "Major Dhyan Chand is India's legendary field hockey player.",
    "explain": "Hockey."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "In volleyball, a team may touch the ball how many times before sending it over?",
    "options": [
      "2",
      "3",
      "4",
      "5"
    ],
    "correct": 1,
    "proof": 53,
    "headline": "Three touches in volleyball",
    "news": "A team is allowed up to three touches before returning the ball over the net.",
    "explain": "3."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian Grand Slam tennis pair won French Open mixed doubles historically?",
    "options": [
      "Leander Paes & Martina Hingis era examples",
      "Sania Mirza only singles",
      "No Indian ever",
      "Only Davis Cup"
    ],
    "correct": 0,
    "proof": 71,
    "headline": "Indians at Grand Slams",
    "news": "Indian players including Leander Paes have won multiple Grand Slam doubles titles.",
    "explain": "Leander Paes & Martina Hingis era examples."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "The term \"LBW\" is used in?",
    "options": [
      "Football",
      "Cricket",
      "Hockey",
      "Tennis"
    ],
    "correct": 1,
    "proof": 51,
    "headline": "LBW in cricket",
    "news": "Leg before wicket (LBW) is a mode of dismissal in cricket.",
    "explain": "Cricket."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Which city hosts the Wimbledon Championships?",
    "options": [
      "Paris",
      "London",
      "New York",
      "Melbourne"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "Wimbledon in London",
    "news": "Wimbledon is held in London, England.",
    "explain": "London."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Usain Bolt specialised in?",
    "options": [
      "Marathon",
      "Sprints",
      "Hurdles",
      "Long jump"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "Bolt — sprint legend",
    "news": "Usain Bolt dominated the 100m and 200m sprints.",
    "explain": "Sprints."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian league is for kabaddi?",
    "options": [
      "ISL",
      "PKL",
      "IBL",
      "HIL"
    ],
    "correct": 1,
    "proof": 70,
    "headline": "Pro Kabaddi League",
    "news": "The Pro Kabaddi League (PKL) is India's top franchise kabaddi competition.",
    "explain": "PKL."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "A rugby union team fields how many players?",
    "options": [
      "11",
      "13",
      "15",
      "18"
    ],
    "correct": 2,
    "proof": 68,
    "headline": "15 in rugby union",
    "news": "Rugby union teams field 15 players each.",
    "explain": "15."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Which shot in cricket goes over the boundary without bouncing for six?",
    "options": [
      "Four",
      "Six",
      "Single",
      "Dot"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "Six clears the rope",
    "news": "A six is scored when the ball clears the boundary on the full.",
    "explain": "Six."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "The Thomas Cup is associated with?",
    "options": [
      "Tennis",
      "Badminton",
      "Table tennis",
      "Squash"
    ],
    "correct": 1,
    "proof": 41,
    "headline": "Thomas Cup — men's badminton",
    "news": "The Thomas Cup is the world men's team badminton championship.",
    "explain": "Badminton."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is linked with the Wankhede Stadium?",
    "options": [
      "Bengaluru",
      "Mumbai",
      "Hyderabad",
      "Ahmedabad"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Wankhede in Mumbai",
    "news": "Wankhede Stadium is a major cricket venue in Mumbai.",
    "explain": "Mumbai."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Grand Slam tennis events number how many per year?",
    "options": [
      "2",
      "3",
      "4",
      "5"
    ],
    "correct": 2,
    "proof": 74,
    "headline": "Four Grand Slams yearly",
    "news": "There are four annual Grand Slam tournaments: AO, French Open, Wimbledon, US Open.",
    "explain": "4."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Which sport did Milkha Singh excel in?",
    "options": [
      "Hockey",
      "Athletics",
      "Wrestling",
      "Boxing"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Milkha Singh — athletics",
    "news": "Milkha Singh, the Flying Sikh, was a celebrated Indian sprinter.",
    "explain": "Athletics."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Offside is a rule in?",
    "options": [
      "Cricket",
      "Football",
      "Badminton",
      "Golf"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Offside in football",
    "news": "The offside rule is a key part of association football.",
    "explain": "Football."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which Indian won multiple badminton Olympic medals?",
    "options": [
      "Saina Nehwal only",
      "PV Sindhu",
      "Deepika Kumari",
      "Heena Sidhu"
    ],
    "correct": 1,
    "proof": 72,
    "headline": "Sindhu's Olympic medals",
    "news": "PV Sindhu has won multiple Olympic medals in badminton.",
    "explain": "PV Sindhu."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "The term \"bogey\" is used in?",
    "options": [
      "Cricket",
      "Golf",
      "Tennis",
      "Hockey"
    ],
    "correct": 1,
    "proof": 40,
    "headline": "Bogey in golf",
    "news": "A bogey means one stroke over par on a golf hole.",
    "explain": "Golf."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "cheer",
    "q": "Which country hosts the Australian Open?",
    "options": [
      "New Zealand",
      "Australia",
      "England",
      "USA"
    ],
    "correct": 1,
    "proof": 40,
    "headline": "Australian Open Down Under",
    "news": "The Australian Open is held annually in Melbourne, Australia.",
    "explain": "Australia."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Kho-kho is a traditional sport of?",
    "options": [
      "India",
      "Brazil",
      "Egypt",
      "Russia"
    ],
    "correct": 0,
    "proof": 68,
    "headline": "Kho-kho is Indian",
    "news": "Kho-kho is a traditional Indian tag sport gaining modern league popularity.",
    "explain": "India."
  },
  {
    "category": "Sports",
    "personal": false,
    "sound": "default",
    "q": "Which ball sport is played on ice with sticks and a puck?",
    "options": [
      "Lacrosse",
      "Ice hockey",
      "Bandy only",
      "Curling"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "Ice hockey uses a puck",
    "news": "Ice hockey is played with sticks and a puck on an ice rink.",
    "explain": "Ice hockey."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "What does AI commonly stand for in technology?",
    "options": [
      "Automated Input",
      "Artificial Intelligence",
      "Analog Interface",
      "Advanced Intranet"
    ],
    "correct": 1,
    "proof": 62,
    "headline": "AI reshapes products",
    "news": "Artificial Intelligence refers to systems that perform tasks typically requiring human intelligence.",
    "explain": "Artificial Intelligence."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which company developed the Android operating system originally before Google's acquisition path?",
    "options": [
      "Apple",
      "Android Inc.",
      "Nokia",
      "Samsung"
    ],
    "correct": 1,
    "proof": 47,
    "headline": "Android's origins",
    "news": "Android began at Android Inc. and was later acquired by Google.",
    "explain": "Android Inc."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "HTTP is the protocol primarily used for?",
    "options": [
      "Email delivery",
      "Web browsing",
      "File compression",
      "GPS tracking"
    ],
    "correct": 1,
    "proof": 56,
    "headline": "HTTP powers the web",
    "news": "HTTP (HyperText Transfer Protocol) is the foundation of data communication on the World Wide Web.",
    "explain": "Web browsing."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which storage unit is largest?",
    "options": [
      "Megabyte",
      "Gigabyte",
      "Terabyte",
      "Kilobyte"
    ],
    "correct": 2,
    "proof": 53,
    "headline": "Terabyte tops common consumer units",
    "news": "Among common consumer units, a terabyte is larger than kilo, mega and giga bytes.",
    "explain": "Terabyte."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "What does URL stand for?",
    "options": [
      "Uniform Resource Locator",
      "Universal Routing Link",
      "User Remote Login",
      "Unified Resource Library"
    ],
    "correct": 0,
    "proof": 66,
    "headline": "URL locates web resources",
    "news": "A URL uniquely identifies the location of a resource on the internet.",
    "explain": "Uniform Resource Locator."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which language is primarily used to style web pages?",
    "options": [
      "HTML",
      "Python",
      "CSS",
      "SQL"
    ],
    "correct": 2,
    "proof": 42,
    "headline": "CSS styles the web",
    "news": "Cascading Style Sheets (CSS) control presentation of HTML documents.",
    "explain": "CSS."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Bluetooth is mainly used for?",
    "options": [
      "Satellite imaging",
      "Short-range wireless links",
      "Deep-sea cables",
      "Nuclear power"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "Bluetooth short-range wireless",
    "news": "Bluetooth enables short-range wireless communication between devices.",
    "explain": "Short-range wireless links."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which company makes the iPhone?",
    "options": [
      "Samsung",
      "Google",
      "Apple",
      "Sony"
    ],
    "correct": 2,
    "proof": 54,
    "headline": "Apple makes iPhone",
    "news": "Apple Inc. designs and sells the iPhone smartphone line.",
    "explain": "Apple."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "RAM in computers is a form of?",
    "options": [
      "Permanent storage",
      "Volatile memory",
      "Optical disc",
      "Cloud only"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "RAM is volatile memory",
    "news": "RAM temporarily stores data while powered and is cleared when the machine shuts down.",
    "explain": "Volatile memory."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which of these is an open-source operating system family?",
    "options": [
      "Windows exclusively",
      "macOS exclusively",
      "Linux",
      "iOS only"
    ],
    "correct": 2,
    "proof": 47,
    "headline": "Linux is open source",
    "news": "Linux is a widely used family of open-source operating systems.",
    "explain": "Linux."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Phishing attacks typically try to?",
    "options": [
      "Cool CPUs",
      "Steal credentials via deception",
      "Increase battery life",
      "Compile code faster"
    ],
    "correct": 1,
    "proof": 50,
    "headline": "Phishing steals credentials",
    "news": "Phishing uses deceptive messages to trick people into revealing passwords or data.",
    "explain": "Steal credentials via deception."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "What does GPS stand for?",
    "options": [
      "Global Positioning System",
      "General Packet Service",
      "Guided Path Software",
      "Geo Point Signal"
    ],
    "correct": 0,
    "proof": 66,
    "headline": "GPS for navigation",
    "news": "The Global Positioning System provides location and time information via satellites.",
    "explain": "Global Positioning System."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "A \"bug\" in software refers to?",
    "options": [
      "A feature flag",
      "An error or defect",
      "A paid plugin",
      "A hardware fan"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Bugs are defects",
    "news": "In software, a bug is an error or defect that causes incorrect behaviour.",
    "explain": "An error or defect."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which company owns WhatsApp?",
    "options": [
      "Apple",
      "Meta",
      "Microsoft",
      "Amazon"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "Meta owns WhatsApp",
    "news": "WhatsApp is owned by Meta Platforms.",
    "explain": "Meta."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Cloud computing primarily means?",
    "options": [
      "Only weather models",
      "On-demand remote computing resources",
      "Local CD storage",
      "Fax networks"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "Cloud = on-demand remote resources",
    "news": "Cloud computing delivers computing services over the internet on demand.",
    "explain": "On-demand remote computing resources."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which is a popular version control system?",
    "options": [
      "Photoshop",
      "Git",
      "Excel",
      "Slack"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "Git for version control",
    "news": "Git is the dominant distributed version control system for software projects.",
    "explain": "Git."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "OLED displays are known for?",
    "options": [
      "Being always reflective only",
      "Deep blacks and flexible panels",
      "Requiring CRT tubes",
      "Using only e-ink"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "OLED deep blacks",
    "news": "OLED pixels emit their own light, enabling deep blacks and thin flexible designs.",
    "explain": "Deep blacks and flexible panels."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "What does IoT stand for?",
    "options": [
      "Internet of Things",
      "Input of Text",
      "Index of Tables",
      "Internal Office Tool"
    ],
    "correct": 0,
    "proof": 66,
    "headline": "Internet of Things",
    "news": "IoT refers to networked physical devices that collect and exchange data.",
    "explain": "Internet of Things."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "CAPTCHA is mainly designed to?",
    "options": [
      "Encrypt hard drives",
      "Tell humans from bots",
      "Speed up Wi-Fi",
      "Charge batteries"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "CAPTCHA blocks bots",
    "news": "CAPTCHA challenges help distinguish human users from automated bots.",
    "explain": "Tell humans from bots."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which protocol is commonly used for secure websites?",
    "options": [
      "FTP",
      "HTTP",
      "HTTPS",
      "SMTP"
    ],
    "correct": 2,
    "proof": 42,
    "headline": "HTTPS secures sites",
    "news": "HTTPS encrypts web traffic between browser and server using TLS.",
    "explain": "HTTPS."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "A firewall in computing is used to?",
    "options": [
      "Cook data",
      "Filter network traffic",
      "Print documents",
      "Cool GPUs"
    ],
    "correct": 1,
    "proof": 51,
    "headline": "Firewalls filter traffic",
    "news": "Firewalls monitor and control incoming and outgoing network traffic based on rules.",
    "explain": "Filter network traffic."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which Indian IT services giant is headquartered in Mumbai?",
    "options": [
      "Infosys",
      "TCS",
      "Wipro",
      "HCLTech"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "TCS Mumbai HQ",
    "news": "Tata Consultancy Services (TCS) is headquartered in Mumbai.",
    "explain": "TCS."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Machine learning is a subset of?",
    "options": [
      "Networking only",
      "Artificial intelligence",
      "Inkjet printing",
      "Analog radio"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "ML under AI umbrella",
    "news": "Machine learning is a major approach within artificial intelligence.",
    "explain": "Artificial intelligence."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which file format is commonly used for compressed archives?",
    "options": [
      "ZIP",
      "BMP",
      "WAV",
      "CSV"
    ],
    "correct": 0,
    "proof": 68,
    "headline": "ZIP compresses files",
    "news": "ZIP is a widely used archive format for compressing files.",
    "explain": "ZIP."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "5G primarily improves?",
    "options": [
      "Postal delivery",
      "Mobile network speed and latency",
      "Paper quality",
      "Satellite mass"
    ],
    "correct": 1,
    "proof": 71,
    "headline": "5G faster mobile nets",
    "news": "5G is the fifth-generation mobile network standard targeting higher speeds and lower latency.",
    "explain": "Mobile network speed and latency."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which language is most associated with Android app development historically?",
    "options": [
      "Swift",
      "Java/Kotlin",
      "Ruby",
      "PHP only"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "Android: Java and Kotlin",
    "news": "Android apps have long been built with Java and, more recently, Kotlin.",
    "explain": "Java/Kotlin."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "A pixel is?",
    "options": [
      "A networking cable",
      "The smallest unit of a digital image",
      "A database key",
      "A type of virus"
    ],
    "correct": 1,
    "proof": 60,
    "headline": "Pixels make digital images",
    "news": "A pixel is the smallest addressable element in a raster digital image.",
    "explain": "The smallest unit of a digital image."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which company developed ChatGPT?",
    "options": [
      "Google",
      "OpenAI",
      "IBM",
      "Oracle"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "OpenAI built ChatGPT",
    "news": "ChatGPT was developed by OpenAI.",
    "explain": "OpenAI."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "SSD storage is generally faster than?",
    "options": [
      "RAM always",
      "HDD (hard disk drives)",
      "CPU registers",
      "L1 cache"
    ],
    "correct": 1,
    "proof": 53,
    "headline": "SSDs beat HDDs",
    "news": "Solid-state drives typically offer much faster access than spinning hard disks.",
    "explain": "HDD (hard disk drives)."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which of these is a web browser?",
    "options": [
      "Photoshop",
      "Chrome",
      "MySQL",
      "Nginx only as browser"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "Chrome is a browser",
    "news": "Google Chrome is a widely used web browser.",
    "explain": "Chrome."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Two-factor authentication adds?",
    "options": [
      "Only a username",
      "An extra verification step",
      "Free cloud space",
      "A second monitor"
    ],
    "correct": 1,
    "proof": 47,
    "headline": "2FA adds a second factor",
    "news": "Two-factor authentication requires a second proof of identity beyond a password.",
    "explain": "An extra verification step."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which Indian digital public infrastructure helps instant payments?",
    "options": [
      "UPI",
      "PAN only",
      "GSTIN only",
      "IFSC alone"
    ],
    "correct": 0,
    "proof": 42,
    "headline": "UPI powers instant payments",
    "news": "Unified Payments Interface (UPI) enables real-time payments across Indian banks and apps.",
    "explain": "UPI."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "API stands for?",
    "options": [
      "Application Programming Interface",
      "Advanced Protocol Internet",
      "Automated Process Integration",
      "App Package Installer"
    ],
    "correct": 0,
    "proof": 57,
    "headline": "APIs connect software",
    "news": "An Application Programming Interface lets software systems communicate.",
    "explain": "Application Programming Interface."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which device is primarily an input device?",
    "options": [
      "Monitor",
      "Keyboard",
      "Speaker",
      "Printer"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "Keyboard is input",
    "news": "A keyboard is a classic computer input device.",
    "explain": "Keyboard."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Bitcoin is an example of?",
    "options": [
      "Fiat paper only",
      "Cryptocurrency",
      "A programming language",
      "A web browser"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Bitcoin is crypto",
    "news": "Bitcoin is the first widely known cryptocurrency.",
    "explain": "Cryptocurrency."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which company owns YouTube?",
    "options": [
      "Meta",
      "Google (Alphabet)",
      "Netflix",
      "Amazon"
    ],
    "correct": 1,
    "proof": 43,
    "headline": "Google owns YouTube",
    "news": "YouTube is owned by Google (Alphabet).",
    "explain": "Google (Alphabet)."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Debugging means?",
    "options": [
      "Removing software defects",
      "Deleting all files",
      "Overclocking CPUs",
      "Formatting disks only"
    ],
    "correct": 0,
    "proof": 58,
    "headline": "Debug = find/fix defects",
    "news": "Debugging is the process of finding and fixing defects in software.",
    "explain": "Removing software defects."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which is a relational database language?",
    "options": [
      "HTML",
      "SQL",
      "CSS",
      "Markdown"
    ],
    "correct": 1,
    "proof": 56,
    "headline": "SQL queries databases",
    "news": "SQL is the standard language for managing relational databases.",
    "explain": "SQL."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Augmented reality (AR) typically?",
    "options": [
      "Replaces reality entirely",
      "Overlays digital content on the real world",
      "Only works offline forever",
      "Is identical to vinyl"
    ],
    "correct": 1,
    "proof": 49,
    "headline": "AR overlays digital on real",
    "news": "AR blends digital information with the user's view of the physical world.",
    "explain": "Overlays digital content on the real world."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which Indian unicorn category grew via quick commerce apps?",
    "options": [
      "Shipbuilding",
      "Grocery delivery startups",
      "Coal mining",
      "Tea estates only"
    ],
    "correct": 1,
    "proof": 42,
    "headline": "Quick commerce boom",
    "news": "India's quick-commerce grocery apps became a major startup category.",
    "explain": "Grocery delivery startups."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "A megapixel equals roughly how many pixels?",
    "options": [
      "1,000",
      "100,000",
      "1,000,000",
      "1 billion"
    ],
    "correct": 2,
    "proof": 66,
    "headline": "Mega = about a million",
    "news": "One megapixel is approximately one million pixels.",
    "explain": "1,000,000."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which protocol sends email between servers?",
    "options": [
      "HTTP",
      "SMTP",
      "FTP",
      "SSH"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "SMTP for email transfer",
    "news": "SMTP is commonly used to transfer email between servers.",
    "explain": "SMTP."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "OpenAI's GPT models are examples of?",
    "options": [
      "Spreadsheets",
      "Large language models",
      "Inkjet printers",
      "RAID arrays"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "GPT = large language model",
    "news": "GPT models are large language models trained on vast text data.",
    "explain": "Large language models."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is a major startup hub besides Bengaluru?",
    "options": [
      "Only Shimla",
      "Hyderabad",
      "Only Shillong",
      "Only Leh"
    ],
    "correct": 1,
    "proof": 42,
    "headline": "Hyderabad startup growth",
    "news": "Hyderabad is among India's leading technology and startup hubs.",
    "explain": "Hyderabad."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Cookie files in browsers often store?",
    "options": [
      "OS kernels",
      "Session/preference data",
      "GPU firmware",
      "SIM cards"
    ],
    "correct": 1,
    "proof": 53,
    "headline": "Cookies store site data",
    "news": "Browser cookies commonly store session and preference information for websites.",
    "explain": "Session/preference data."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which is a semiconductor company famous for CPUs?",
    "options": [
      "Nike",
      "Intel",
      "Nestle",
      "IKEA"
    ],
    "correct": 1,
    "proof": 65,
    "headline": "Intel makes CPUs",
    "news": "Intel is a major semiconductor company known for processors.",
    "explain": "Intel."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Latency in networks refers to?",
    "options": [
      "Cable colour",
      "Delay before data transfer completes a round",
      "Screen resolution",
      "Mouse DPI only"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Latency is delay",
    "news": "Latency measures the delay in network communication.",
    "explain": "Delay before data transfer completes a round."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which app category includes Instagram?",
    "options": [
      "Spreadsheet",
      "Social media",
      "Compiler",
      "BIOS"
    ],
    "correct": 1,
    "proof": 54,
    "headline": "Instagram is social media",
    "news": "Instagram is a social media platform focused on photos and short video.",
    "explain": "Social media."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Quantum computing explores?",
    "options": [
      "Only vacuum tubes",
      "Quantum bits (qubits) for computation",
      "Steam engines",
      "Fountain pens"
    ],
    "correct": 1,
    "proof": 43,
    "headline": "Qubits power quantum computing",
    "news": "Quantum computers use qubits that can represent more than classical binary states.",
    "explain": "Quantum bits (qubits) for computation."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which Indian government portal is for digital identity?",
    "options": [
      "Aadhaar ecosystem",
      "Only IRCTC",
      "Only DigiLocker unrelated",
      "Only UMANG games"
    ],
    "correct": 0,
    "proof": 64,
    "headline": "Aadhaar digital identity",
    "news": "Aadhaar provides a unique digital identity framework used across Indian services.",
    "explain": "Aadhaar ecosystem."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Malware is software designed to?",
    "options": [
      "Help users exclusively",
      "Harm or exploit systems",
      "Print photos only",
      "Calibrate monitors"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "Malware harms systems",
    "news": "Malware is malicious software intended to damage or exploit computers.",
    "explain": "Harm or exploit systems."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which company makes PlayStation consoles?",
    "options": [
      "Microsoft",
      "Sony",
      "Nintendo",
      "Sega only now"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Sony makes PlayStation",
    "news": "Sony Interactive Entertainment produces the PlayStation console family.",
    "explain": "Sony."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Bandwidth commonly measures?",
    "options": [
      "Data transfer capacity",
      "Monitor brightness only",
      "CPU temperature",
      "Mouse DPI only"
    ],
    "correct": 0,
    "proof": 70,
    "headline": "Bandwidth = capacity",
    "news": "Bandwidth indicates how much data can be transferred in a given time.",
    "explain": "Data transfer capacity."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Which Indian IT firm is based in Bengaluru among Infosys HQ?",
    "options": [
      "Infosys",
      "Coal India",
      "IOC only",
      "SAIL only"
    ],
    "correct": 0,
    "proof": 69,
    "headline": "Infosys Bengaluru roots",
    "news": "Infosys is one of India's major IT services companies with deep Bengaluru roots.",
    "explain": "Infosys."
  },
  {
    "category": "Tech",
    "personal": false,
    "sound": "default",
    "q": "Edge computing processes data?",
    "options": [
      "Only on paper",
      "Closer to where it is generated",
      "Only on floppy disks",
      "Only via fax"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Edge near the source",
    "news": "Edge computing processes data near devices or local gateways to reduce latency.",
    "explain": "Closer to where it is generated."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "GDP stands for?",
    "options": [
      "Gross Domestic Product",
      "General Debt Policy",
      "Global Development Plan",
      "Government Deposit Pool"
    ],
    "correct": 0,
    "proof": 57,
    "headline": "GDP measures output",
    "news": "Gross Domestic Product measures the value of goods and services produced in an economy.",
    "explain": "Gross Domestic Product."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "RBI is India's?",
    "options": [
      "Stock exchange",
      "Central bank",
      "Income tax office",
      "Railway board"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "RBI is central bank",
    "news": "The Reserve Bank of India is the country's central bank.",
    "explain": "Central bank."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A bull market generally means prices are?",
    "options": [
      "Falling",
      "Rising",
      "Frozen",
      "Illegal"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Bulls run up",
    "news": "A bull market is characterised by rising asset prices and optimism.",
    "explain": "Rising."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "GST in India is a tax on?",
    "options": [
      "Only imports of gold",
      "Goods and services",
      "Only agricultural land",
      "Only petrol historically exclusive"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "GST on goods and services",
    "news": "Goods and Services Tax is India's destination-based indirect tax on supply of goods and services.",
    "explain": "Goods and services."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which index tracks large companies on NSE?",
    "options": [
      "Sensex",
      "Nifty 50",
      "Dow only",
      "FTSE only"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "Nifty 50 on NSE",
    "news": "The Nifty 50 is NSE's benchmark index of large Indian companies.",
    "explain": "Nifty 50."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "IPO stands for?",
    "options": [
      "Initial Public Offering",
      "Internal Profit Option",
      "International Purchase Order",
      "Indexed Pay Out"
    ],
    "correct": 0,
    "proof": 57,
    "headline": "IPO takes firms public",
    "news": "An Initial Public Offering is when a private company first sells shares to the public.",
    "explain": "Initial Public Offering."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Inflation refers to?",
    "options": [
      "Falling prices",
      "Rising general price levels",
      "Stock splits only",
      "Currency printing art"
    ],
    "correct": 1,
    "proof": 69,
    "headline": "Inflation = rising prices",
    "news": "Inflation is a sustained rise in the general price level of goods and services.",
    "explain": "Rising general price levels."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian company is a major IT exporter?",
    "options": [
      "Amul only",
      "Infosys",
      "IRCTC only",
      "FCI only"
    ],
    "correct": 1,
    "proof": 60,
    "headline": "Infosys IT exports",
    "news": "Infosys is among India's leading information technology services exporters.",
    "explain": "Infosys."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A balance sheet shows?",
    "options": [
      "Only tweets",
      "Assets, liabilities and equity",
      "Only employee birthdays",
      "Only website traffic"
    ],
    "correct": 1,
    "proof": 71,
    "headline": "Balance sheet snapshot",
    "news": "A balance sheet summarises assets, liabilities and equity at a point in time.",
    "explain": "Assets, liabilities and equity."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "SEBI regulates?",
    "options": [
      "Cricket umpires",
      "Securities markets in India",
      "Forest covers",
      "Postal stamps"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "SEBI markets regulator",
    "news": "The Securities and Exchange Board of India regulates securities markets.",
    "explain": "Securities markets in India."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Microfinance mainly targets?",
    "options": [
      "Large conglomerates only",
      "Small borrowers often underserved by banks",
      "Space agencies",
      "Oil cartels"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "Microfinance for small borrowers",
    "news": "Microfinance provides small loans and financial services to underserved borrowers.",
    "explain": "Small borrowers often underserved by banks."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which is a blue-chip stock characteristic?",
    "options": [
      "Always penny priced",
      "Large, established company",
      "Only unlisted startups",
      "Only crypto tokens"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "Blue chips are established",
    "news": "Blue-chip stocks typically belong to large, financially sound companies.",
    "explain": "Large, established company."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "FDI stands for?",
    "options": [
      "Foreign Direct Investment",
      "Federal Debt Instrument",
      "Fast Digital Invoice",
      "Fiscal Deficit Index"
    ],
    "correct": 0,
    "proof": 57,
    "headline": "FDI = foreign investment",
    "news": "Foreign Direct Investment is investment from abroad into productive assets.",
    "explain": "Foreign Direct Investment."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "The Sensex is associated with which exchange?",
    "options": [
      "NSE",
      "BSE",
      "NYSE only",
      "LSE only"
    ],
    "correct": 1,
    "proof": 61,
    "headline": "Sensex is BSE index",
    "news": "The Sensex is the benchmark index of the Bombay Stock Exchange (BSE).",
    "explain": "BSE."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A startup unicorn has valuation over?",
    "options": [
      "10 million USD",
      "100 million USD",
      "1 billion USD",
      "10 billion USD always"
    ],
    "correct": 2,
    "proof": 60,
    "headline": "Unicorn = 1B+ valuation",
    "news": "A unicorn startup is privately valued at over 1 billion US dollars.",
    "explain": "1 billion USD."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Fiscal deficit occurs when?",
    "options": [
      "Exports exceed imports",
      "Government spending exceeds revenue excluding borrowing",
      "Inflation is zero",
      "Banks close"
    ],
    "correct": 1,
    "proof": 43,
    "headline": "Fiscal deficit gap",
    "news": "Fiscal deficit arises when a government's expenditure exceeds its non-borrowed receipts.",
    "explain": "Government spending exceeds revenue excluding borrowing."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian conglomerate founded Reliance?",
    "options": [
      "Tata",
      "Birla",
      "Ambani (Dhirubhai Ambani)",
      "Godrej only"
    ],
    "correct": 2,
    "proof": 66,
    "headline": "Reliance and Ambani",
    "news": "Reliance Industries was founded by Dhirubhai Ambani.",
    "explain": "Ambani (Dhirubhai Ambani)."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "EMI in loans typically means?",
    "options": [
      "Early Money Incentive",
      "Equated Monthly Instalment",
      "Electronic Market Index",
      "Export Margin Income"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "EMI = monthly instalment",
    "news": "Equated Monthly Instalments are fixed periodic loan repayments.",
    "explain": "Equated Monthly Instalment."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which tax is direct in India among these?",
    "options": [
      "GST",
      "Income tax",
      "Customs on tourists souvenirs only",
      "Stamp on letters only"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Income tax is direct",
    "news": "Income tax is a direct tax paid by individuals and entities on income.",
    "explain": "Income tax."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "NPA in banking refers to?",
    "options": [
      "New Product Award",
      "Non-Performing Asset",
      "National Payment App",
      "Net Profit Average"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "NPAs are bad loans",
    "news": "A Non-Performing Asset is a loan where interest or principal is overdue beyond norms.",
    "explain": "Non-Performing Asset."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which organisation sets monetary policy in India?",
    "options": [
      "NITI Aayog",
      "RBI",
      "ISRO",
      "FSSAI"
    ],
    "correct": 1,
    "proof": 65,
    "headline": "RBI sets monetary policy",
    "news": "The Reserve Bank of India formulates and implements monetary policy.",
    "explain": "RBI."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Diversification in investing aims to?",
    "options": [
      "Increase single-stock risk",
      "Reduce risk by spreading investments",
      "Avoid all markets",
      "Only buy gold forever"
    ],
    "correct": 1,
    "proof": 53,
    "headline": "Diversify to cut risk",
    "news": "Diversification spreads investments to reduce exposure to any single asset's failure.",
    "explain": "Reduce risk by spreading investments."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian airline is the flag carrier?",
    "options": [
      "SpiceJet only",
      "Air India",
      "Only IndiGo state-owned",
      "Only Akasa state"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Air India flag carrier",
    "news": "Air India is India's flag carrier airline.",
    "explain": "Air India."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Breakeven point is where?",
    "options": [
      "Only profits explode",
      "Revenues equal costs",
      "Stocks delist",
      "Taxes vanish"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Breakeven: revenue = cost",
    "news": "At breakeven, total revenues equal total costs with neither profit nor loss.",
    "explain": "Revenues equal costs."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian bank is the largest public sector bank by many measures?",
    "options": [
      "Yes Bank",
      "SBI",
      "Bandhan Bank",
      "CSB"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "SBI leads PSU banks",
    "news": "State Bank of India is India's largest public sector bank.",
    "explain": "SBI."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A bear market generally means prices are?",
    "options": [
      "Rising fast",
      "Falling",
      "Unchanged forever",
      "Only crypto"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Bears push prices down",
    "news": "A bear market is characterised by prolonged falling prices.",
    "explain": "Falling."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "MSME stands for?",
    "options": [
      "Micro, Small and Medium Enterprises",
      "Mega State Manufacturing Entity",
      "Market Share Metric Estimate",
      "Monthly Salary Management Export"
    ],
    "correct": 0,
    "proof": 58,
    "headline": "MSMEs power economy",
    "news": "Micro, Small and Medium Enterprises form a large part of India's business landscape.",
    "explain": "Micro, Small and Medium Enterprises."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which global body is known for oil producer coordination?",
    "options": [
      "WHO",
      "OPEC",
      "WTO only for oil",
      "IMF for oil wells"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "OPEC and oil",
    "news": "OPEC coordinates petroleum policies among major oil-exporting countries.",
    "explain": "OPEC."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Demat account is used to hold?",
    "options": [
      "Physical gold only",
      "Securities in electronic form",
      "Land deeds only",
      "Cash under mattress"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Demat holds e-securities",
    "news": "A dematerialised demat account holds shares and securities electronically.",
    "explain": "Securities in electronic form."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian app-based company is known for food delivery?",
    "options": [
      "Zomato",
      "ONGC",
      "SAIL",
      "NTPC"
    ],
    "correct": 0,
    "proof": 67,
    "headline": "Zomato food delivery",
    "news": "Zomato is a major Indian food delivery and restaurant discovery platform.",
    "explain": "Zomato."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Repo rate is the rate at which?",
    "options": [
      "Citizens borrow from friends",
      "RBI lends to commercial banks",
      "Farmers sell crops",
      "SEBI fines brokers"
    ],
    "correct": 1,
    "proof": 47,
    "headline": "Repo: RBI to banks",
    "news": "The repo rate is the rate at which the RBI lends short-term funds to commercial banks.",
    "explain": "RBI lends to commercial banks."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Brand equity refers to?",
    "options": [
      "Warehouse size",
      "Value of a brand in consumer minds",
      "Only logo fonts",
      "Factory age"
    ],
    "correct": 1,
    "proof": 72,
    "headline": "Brand equity is brand value",
    "news": "Brand equity is the commercial value derived from consumer perception of a brand.",
    "explain": "Value of a brand in consumer minds."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian budget is presented by?",
    "options": [
      "Chief Justice",
      "Finance Minister",
      "Election Commission alone",
      "RBI Governor only"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "Finance Minister presents Budget",
    "news": "India's Union Budget is presented by the Finance Minister in Parliament.",
    "explain": "Finance Minister."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Liquidity in markets means?",
    "options": [
      "How watery stocks are",
      "Ease of buying/selling assets without big price swings",
      "Rainfall index",
      "Only cash under lock"
    ],
    "correct": 1,
    "proof": 43,
    "headline": "Liquidity = easy trading",
    "news": "Liquidity describes how easily an asset can be traded without large price impact.",
    "explain": "Ease of buying/selling assets without big price swings."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which company is known for the Amul cooperative brand?",
    "options": [
      "GCMMF ecosystem",
      "Reliance Fresh only",
      "Amazon Pantry",
      "Walmart only"
    ],
    "correct": 0,
    "proof": 63,
    "headline": "Amul cooperative brand",
    "news": "Amul is marketed by the Gujarat Cooperative Milk Marketing Federation ecosystem.",
    "explain": "GCMMF ecosystem."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A dividend is typically?",
    "options": [
      "A company fine",
      "Share of profits paid to shareholders",
      "A type of loan interest only",
      "A GST slab"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Dividends share profits",
    "news": "Dividends are distributions of company profits to shareholders.",
    "explain": "Share of profits paid to shareholders."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city hosts Dalal Street?",
    "options": [
      "Delhi",
      "Mumbai",
      "Kolkata",
      "Chennai"
    ],
    "correct": 1,
    "proof": 53,
    "headline": "Dalal Street in Mumbai",
    "news": "Dalal Street in Mumbai is synonymous with the BSE financial district.",
    "explain": "Mumbai."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "PPP in economics often means?",
    "options": [
      "Public-Private Partnership or Purchasing Power Parity",
      "Only Postal Parcel Post",
      "Private Party Permit",
      "Paid Parking Pass"
    ],
    "correct": 0,
    "proof": 71,
    "headline": "PPP dual meaning",
    "news": "In economics and policy, PPP commonly means Public-Private Partnership or Purchasing Power Parity.",
    "explain": "Public-Private Partnership or Purchasing Power Parity."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian edtech name became globally known in the 2010s-20s?",
    "options": [
      "Byju's",
      "Coal India",
      "BHEL",
      "GAIL"
    ],
    "correct": 0,
    "proof": 73,
    "headline": "Byju's edtech rise",
    "news": "Byju's became one of India's best-known edtech brands during the digital learning boom.",
    "explain": "Byju's."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Market capitalisation equals?",
    "options": [
      "Share price times shares outstanding",
      "Only annual revenue",
      "Only employee count",
      "Only factory area"
    ],
    "correct": 0,
    "proof": 71,
    "headline": "M-cap = price times shares",
    "news": "Market capitalisation is share price multiplied by shares outstanding.",
    "explain": "Share price times shares outstanding."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian UPI apps are widely used?",
    "options": [
      "PhonePe/GPay/Paytm class",
      "Only SWIFT terminals",
      "Only Western Union kiosks",
      "Only traveller cheques"
    ],
    "correct": 0,
    "proof": 47,
    "headline": "UPI apps dominate payments",
    "news": "Apps like PhonePe, Google Pay and Paytm popularised UPI payments in India.",
    "explain": "PhonePe/GPay/Paytm class."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A recession is generally?",
    "options": [
      "A short stock tip",
      "A significant decline in economic activity",
      "A cricket timeout",
      "A monsoon forecast"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Recession = activity decline",
    "news": "A recession is a sustained period of declining economic activity.",
    "explain": "A significant decline in economic activity."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian company is a major auto maker?",
    "options": [
      "Maruti Suzuki",
      "ISRO",
      "DRDO",
      "ICMR"
    ],
    "correct": 0,
    "proof": 52,
    "headline": "Maruti Suzuki autos",
    "news": "Maruti Suzuki is one of India's largest passenger car manufacturers.",
    "explain": "Maruti Suzuki."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Working capital typically means?",
    "options": [
      "Long-term debt only",
      "Current assets minus current liabilities",
      "CEO salary",
      "Office plants"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "Working capital formula",
    "news": "Working capital is commonly current assets minus current liabilities.",
    "explain": "Current assets minus current liabilities."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which global bank is a major Swiss bank?",
    "options": [
      "Only SBI",
      "UBS",
      "Only RBI",
      "Only NABARD"
    ],
    "correct": 1,
    "proof": 56,
    "headline": "Swiss banking majors",
    "news": "UBS is among the major banks historically headquartered in Switzerland.",
    "explain": "UBS."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Make in India aims to boost?",
    "options": [
      "Only imports",
      "Manufacturing and investment in India",
      "Only tourism visas",
      "Only film awards"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "Make in India manufacturing push",
    "news": "Make in India encourages domestic manufacturing and foreign investment.",
    "explain": "Manufacturing and investment in India."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A bond is primarily a?",
    "options": [
      "Equity share always",
      "Debt instrument",
      "Cryptocurrency wallet",
      "Trademark"
    ],
    "correct": 1,
    "proof": 71,
    "headline": "Bonds are debt",
    "news": "Bonds are debt securities where investors lend to issuers for interest.",
    "explain": "Debt instrument."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian e-commerce giant was founded by Sachin and Binny Bansal?",
    "options": [
      "Flipkart",
      "Myntra only foreign",
      "Nykaa only",
      "Meesho only"
    ],
    "correct": 0,
    "proof": 45,
    "headline": "Flipkart founders",
    "news": "Flipkart was founded by Sachin Bansal and Binny Bansal.",
    "explain": "Flipkart."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "CSR in companies often means?",
    "options": [
      "Customer Service Robot",
      "Corporate Social Responsibility",
      "Cash Stock Ratio only",
      "Central Sales Rebate"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "CSR social responsibility",
    "news": "Corporate Social Responsibility covers companies' social and environmental initiatives.",
    "explain": "Corporate Social Responsibility."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which metric approximates company profitability on sales?",
    "options": [
      "Bounce rate",
      "Profit margin",
      "Page rank",
      "Click-through only"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Profit margin on sales",
    "news": "Profit margin measures how much profit is earned relative to revenue.",
    "explain": "Profit margin."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "SoftBank is known as a?",
    "options": [
      "Cricket board",
      "Major technology investor",
      "Indian PSU bank",
      "Tea brand"
    ],
    "correct": 1,
    "proof": 72,
    "headline": "SoftBank tech investor",
    "news": "SoftBank is a major global investor in technology companies.",
    "explain": "Major technology investor."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "India's financial year for the Union currently runs?",
    "options": [
      "Jan-Dec only",
      "April-March",
      "July-June only",
      "Oct-Sep only"
    ],
    "correct": 1,
    "proof": 68,
    "headline": "FY April to March",
    "news": "India's Union financial year runs from 1 April to 31 March.",
    "explain": "April-March."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "A monopoly means?",
    "options": [
      "Many sellers",
      "Single dominant seller",
      "No buyers",
      "Only barter"
    ],
    "correct": 1,
    "proof": 66,
    "headline": "Monopoly = one seller",
    "news": "A monopoly exists when a single seller dominates a market.",
    "explain": "Single dominant seller."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Venture capital typically funds?",
    "options": [
      "Only government bonds",
      "Early-stage high-growth companies",
      "Only mature PSU dividends",
      "Only farmland leases"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "VC funds startups",
    "news": "Venture capital invests in early-stage companies with high growth potential.",
    "explain": "Early-stage high-growth companies."
  },
  {
    "category": "Business",
    "personal": false,
    "sound": "default",
    "q": "Which Indian fintech area grew fastest with UPI?",
    "options": [
      "Ship engines",
      "Digital payments",
      "Coal washing",
      "Tea auctions"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "UPI drove fintech payments",
    "news": "India's digital payments ecosystem expanded rapidly with UPI adoption.",
    "explain": "Digital payments."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "India's Constitution came into effect on?",
    "options": [
      "15 August 1947",
      "26 January 1950",
      "26 November 1949",
      "2 October 1947"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Republic Day 26 January",
    "news": "India became a republic when the Constitution came into effect on 26 January 1950.",
    "explain": "26 January 1950."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "How many states does India have currently?",
    "options": [
      "25",
      "28",
      "29",
      "30"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "India has 28 states",
    "news": "India currently has 28 states and multiple Union Territories.",
    "explain": "28."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Who is known as the Iron Man of India?",
    "options": [
      "Nehru",
      "Sardar Vallabhbhai Patel",
      "Bose",
      "Ambedkar"
    ],
    "correct": 1,
    "proof": 54,
    "headline": "Patel — Iron Man",
    "news": "Sardar Vallabhbhai Patel is remembered as the Iron Man of India for integrating princely states.",
    "explain": "Sardar Vallabhbhai Patel."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Chota Nagpur plateau is rich in?",
    "options": [
      "Tea only",
      "Minerals",
      "Coral reefs",
      "Petroleum only"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "Chota Nagpur minerals",
    "news": "The Chota Nagpur plateau is known for rich mineral deposits.",
    "explain": "Minerals."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which city is the capital of India?",
    "options": [
      "Mumbai",
      "New Delhi",
      "Kolkata",
      "Hyderabad"
    ],
    "correct": 1,
    "proof": 51,
    "headline": "New Delhi capital",
    "news": "New Delhi is the capital of India.",
    "explain": "New Delhi."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "India's highest civilian award is?",
    "options": [
      "Padma Shri",
      "Bharat Ratna",
      "Padma Vibhushan",
      "Param Vir Chakra"
    ],
    "correct": 1,
    "proof": 50,
    "headline": "Bharat Ratna highest civilian",
    "news": "The Bharat Ratna is India's highest civilian honour.",
    "explain": "Bharat Ratna."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Green Revolution in India is associated with?",
    "options": [
      "High-yield agriculture push",
      "Only IT parks",
      "Only space launches",
      "Only textile mills"
    ],
    "correct": 0,
    "proof": 54,
    "headline": "Green Revolution agriculture",
    "news": "India's Green Revolution boosted foodgrain production with high-yield varieties and inputs.",
    "explain": "High-yield agriculture push."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which river is considered most sacred by many Hindus?",
    "options": [
      "Narmada",
      "Ganga",
      "Brahmaputra",
      "Mahanadi"
    ],
    "correct": 1,
    "proof": 69,
    "headline": "Ganga sacred river",
    "news": "The Ganga holds deep religious significance for millions of Hindus.",
    "explain": "Ganga."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Goa was liberated from which colonial power in 1961?",
    "options": [
      "British",
      "Portuguese",
      "French",
      "Dutch"
    ],
    "correct": 1,
    "proof": 68,
    "headline": "Goa from Portuguese",
    "news": "India liberated Goa from Portuguese rule in 1961.",
    "explain": "Portuguese."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state is known as God's Own Country in tourism branding?",
    "options": [
      "Goa",
      "Kerala",
      "Sikkim",
      "Himachal"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "Kerala tourism brand",
    "news": "Kerala is widely promoted as God's Own Country.",
    "explain": "Kerala."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Quit India Movement began in?",
    "options": [
      "1920",
      "1930",
      "1942",
      "1947"
    ],
    "correct": 2,
    "proof": 56,
    "headline": "Quit India 1942",
    "news": "The Quit India Movement was launched in 1942 demanding an end to British rule.",
    "explain": "1942."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which desert is located in western India?",
    "options": [
      "Sahara",
      "Thar",
      "Gobi",
      "Kalahari"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Thar Desert",
    "news": "The Thar Desert stretches across western Rajasthan and adjoining areas.",
    "explain": "Thar."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Who was India's first President?",
    "options": [
      "Rajendra Prasad",
      "Radhakrishnan",
      "Zakir Husain",
      "V.V. Giri"
    ],
    "correct": 0,
    "proof": 74,
    "headline": "Rajendra Prasad first President",
    "news": "Dr Rajendra Prasad was the first President of India.",
    "explain": "Rajendra Prasad."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "ISRO is India's?",
    "options": [
      "Tax agency",
      "Space research organisation",
      "Election body",
      "Weather only office"
    ],
    "correct": 1,
    "proof": 65,
    "headline": "ISRO space agency",
    "news": "The Indian Space Research Organisation is India's national space agency.",
    "explain": "Space research organisation."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Chipko movement is associated with?",
    "options": [
      "Forest conservation",
      "Nuclear power",
      "Cricket reform",
      "Banking"
    ],
    "correct": 0,
    "proof": 48,
    "headline": "Chipko forest movement",
    "news": "Chipko was a famous forest conservation movement in the Himalayas.",
    "explain": "Forest conservation."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian festival marks the harvest in Punjab prominently?",
    "options": [
      "Onam",
      "Baisakhi",
      "Pongal only south exclusive",
      "Bihu only Assam exclusive always"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "Baisakhi harvest festival",
    "news": "Baisakhi is a major harvest festival celebrated prominently in Punjab.",
    "explain": "Baisakhi."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Gateway of India is in?",
    "options": [
      "Delhi",
      "Mumbai",
      "Chennai",
      "Kolkata"
    ],
    "correct": 1,
    "proof": 43,
    "headline": "Gateway of India Mumbai",
    "news": "The Gateway of India landmark stands in Mumbai.",
    "explain": "Mumbai."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Who founded the Indian National Army (INA)?",
    "options": [
      "Gandhi",
      "Subhas Chandra Bose (leadership)",
      "Tilak only",
      "Gokhale only"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "Bose and the INA",
    "news": "Subhas Chandra Bose is closely associated with leading the Indian National Army.",
    "explain": "Subhas Chandra Bose (leadership)."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which state is the largest producer of milk in India typically?",
    "options": [
      "Kerala",
      "Uttar Pradesh",
      "Goa",
      "Sikkim"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "UP leads milk often",
    "news": "Uttar Pradesh is frequently among India's top milk-producing states.",
    "explain": "Uttar Pradesh."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Lok Sabha is the?",
    "options": [
      "Upper house",
      "Lower house of Parliament",
      "Supreme Court bench",
      "State cabinet"
    ],
    "correct": 1,
    "proof": 66,
    "headline": "Lok Sabha lower house",
    "news": "The Lok Sabha is the lower house of India's Parliament.",
    "explain": "Lower house of Parliament."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is called the Pink City?",
    "options": [
      "Udaipur",
      "Jaipur",
      "Jodhpur",
      "Bikaner"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "Jaipur Pink City",
    "news": "Jaipur is popularly known as the Pink City.",
    "explain": "Jaipur."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Tropic of Cancer does NOT pass through?",
    "options": [
      "Rajasthan",
      "Gujarat",
      "Kerala",
      "Madhya Pradesh"
    ],
    "correct": 2,
    "proof": 66,
    "headline": "Cancer misses Kerala",
    "news": "The Tropic of Cancer does not pass through Kerala.",
    "explain": "Kerala."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Who wrote Discovery of India?",
    "options": [
      "Gandhi",
      "Nehru",
      "Ambedkar",
      "Tagore"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "Nehru's Discovery of India",
    "news": "Jawaharlal Nehru wrote The Discovery of India.",
    "explain": "Nehru."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state has the longest coastline?",
    "options": [
      "Kerala",
      "Gujarat",
      "Odisha",
      "West Bengal"
    ],
    "correct": 1,
    "proof": 61,
    "headline": "Gujarat longest coastline",
    "news": "Gujarat has India's longest state coastline.",
    "explain": "Gujarat."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "NITI Aayog replaced?",
    "options": [
      "Planning Commission",
      "Election Commission",
      "UPSC",
      "CAG"
    ],
    "correct": 0,
    "proof": 62,
    "headline": "NITI replaced Planning Commission",
    "news": "NITI Aayog replaced the Planning Commission as a policy think tank.",
    "explain": "Planning Commission."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which monument is among the Seven Wonders of the modern world from India?",
    "options": [
      "Qutub Minar",
      "Taj Mahal",
      "Red Fort only",
      "India Gate"
    ],
    "correct": 1,
    "proof": 56,
    "headline": "Taj among modern wonders",
    "news": "The Taj Mahal is listed among the New Seven Wonders of the World.",
    "explain": "Taj Mahal."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "India's national tree is?",
    "options": [
      "Neem",
      "Banyan",
      "Peepal only exclusive",
      "Teak"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Banyan national tree",
    "news": "The banyan is India's national tree.",
    "explain": "Banyan."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which battle in 1757 is linked to British ascendancy in Bengal?",
    "options": [
      "Panipat III",
      "Plassey",
      "Buxar only later exclusive",
      "Haldighati"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Battle of Plassey",
    "news": "The Battle of Plassey (1757) helped establish British power in Bengal.",
    "explain": "Plassey."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state is landlocked among these?",
    "options": [
      "Gujarat",
      "Madhya Pradesh",
      "Odisha",
      "Tamil Nadu"
    ],
    "correct": 1,
    "proof": 61,
    "headline": "MP is landlocked",
    "news": "Madhya Pradesh is a landlocked state.",
    "explain": "Madhya Pradesh."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Indian National Congress was founded in?",
    "options": [
      "1857",
      "1885",
      "1905",
      "1919"
    ],
    "correct": 1,
    "proof": 60,
    "headline": "Congress founded 1885",
    "news": "The Indian National Congress was founded in 1885.",
    "explain": "1885."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which city hosts the headquarters of the Reserve Bank of India?",
    "options": [
      "Delhi",
      "Mumbai",
      "Kolkata",
      "Chennai"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "RBI HQ Mumbai",
    "news": "The Reserve Bank of India is headquartered in Mumbai.",
    "explain": "Mumbai."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Jallianwala Bagh is in?",
    "options": [
      "Delhi",
      "Amritsar",
      "Lahore only now",
      "Lucknow"
    ],
    "correct": 1,
    "proof": 72,
    "headline": "Jallianwala Bagh Amritsar",
    "news": "Jallianwala Bagh is located in Amritsar, Punjab.",
    "explain": "Amritsar."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state is famous for backwaters tourism?",
    "options": [
      "Rajasthan",
      "Kerala",
      "Punjab",
      "Haryana"
    ],
    "correct": 1,
    "proof": 68,
    "headline": "Kerala backwaters",
    "news": "Kerala's backwaters are a major tourism attraction.",
    "explain": "Kerala."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Preamble of India begins with?",
    "options": [
      "We the People of India",
      "India that is Bharat only later",
      "Liberty Equality only",
      "Justice for all only"
    ],
    "correct": 0,
    "proof": 43,
    "headline": "We the People",
    "news": "The Preamble opens with \"We, the People of India\".",
    "explain": "We the People of India."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which peak is India's highest (within Indian territory commonly cited)?",
    "options": [
      "Nanda Devi",
      "Kangchenjunga",
      "Mount Everest in Nepal exclusive",
      "Anamudi"
    ],
    "correct": 1,
    "proof": 54,
    "headline": "Kangchenjunga high peak",
    "news": "Kangchenjunga is often cited among India's highest peaks on the border region.",
    "explain": "Kangchenjunga."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Who is called the Missile Man of India?",
    "options": [
      "Vikram Sarabhai",
      "A.P.J. Abdul Kalam",
      "Homi Bhabha",
      "Satish Dhawan"
    ],
    "correct": 1,
    "proof": 55,
    "headline": "Kalam Missile Man",
    "news": "Dr A.P.J. Abdul Kalam is popularly known as the Missile Man of India.",
    "explain": "A.P.J. Abdul Kalam."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian classical dance is from Tamil Nadu?",
    "options": [
      "Kathak",
      "Bharatanatyam",
      "Manipuri",
      "Odissi"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "Bharatanatyam from TN",
    "news": "Bharatanatyam is a classical dance form originating from Tamil Nadu.",
    "explain": "Bharatanatyam."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Planning Commission was established in?",
    "options": [
      "1947",
      "1950",
      "1962",
      "1991"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "Planning Commission 1950",
    "news": "India's Planning Commission was set up in 1950.",
    "explain": "1950."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is a major tea auction centre historically?",
    "options": [
      "Jaipur",
      "Kolkata",
      "Chandigarh",
      "Bhopal"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "Kolkata tea auctions",
    "news": "Kolkata has long been a major centre for tea auctions in India.",
    "explain": "Kolkata."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Right to Education is a?",
    "options": [
      "Directive only forever",
      "Fundamental right (Article 21A era)",
      "Only state subject joke",
      "Only NGO guideline"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "RTE as fundamental right",
    "news": "The Right to Education is recognised as a fundamental right in India.",
    "explain": "Fundamental right (Article 21A era)."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian UT was formed by merging Dadra & Nagar Haveli and Daman & Diu?",
    "options": [
      "Ladakh",
      "Dadra and Nagar Haveli and Daman and Diu",
      "Puducherry",
      "Chandigarh"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "Merged western UT",
    "news": "Dadra & Nagar Haveli and Daman & Diu were merged into a single Union Territory.",
    "explain": "Dadra and Nagar Haveli and Daman and Diu."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Who gave the slogan \"Do or Die\"?",
    "options": [
      "Nehru",
      "Gandhi",
      "Bose",
      "Bhagat Singh"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "Gandhi Do or Die",
    "news": "Mahatma Gandhi gave the \"Do or Die\" call during Quit India.",
    "explain": "Gandhi."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state is the leading producer of coffee typically?",
    "options": [
      "Punjab",
      "Karnataka",
      "Rajasthan",
      "Haryana"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Karnataka coffee lead",
    "news": "Karnataka is India's leading coffee-producing state.",
    "explain": "Karnataka."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Supreme Court of India is in?",
    "options": [
      "Mumbai",
      "New Delhi",
      "Kolkata",
      "Hyderabad"
    ],
    "correct": 1,
    "proof": 49,
    "headline": "Supreme Court in Delhi",
    "news": "The Supreme Court of India is located in New Delhi.",
    "explain": "New Delhi."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian freedom fighter is associated with Hindustan Socialist Republican Association?",
    "options": [
      "Only Nehru",
      "Bhagat Singh (among others)",
      "Only Motilal",
      "Only Rajaji"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Bhagat Singh and HSRA",
    "news": "Bhagat Singh was associated with revolutionary groups including the HSRA tradition.",
    "explain": "Bhagat Singh (among others)."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Kaziranga National Park is famous for?",
    "options": [
      "Penguins",
      "One-horned rhinoceros",
      "Polar bears",
      "Kangaroos"
    ],
    "correct": 1,
    "proof": 54,
    "headline": "Kaziranga rhinos",
    "news": "Kaziranga in Assam is renowned for the one-horned rhinoceros.",
    "explain": "One-horned rhinoceros."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is known for Charminar?",
    "options": [
      "Lucknow",
      "Hyderabad",
      "Mysuru",
      "Nagpur"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Charminar Hyderabad",
    "news": "The Charminar is an iconic monument in Hyderabad.",
    "explain": "Hyderabad."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The First War of Independence is often linked to the year?",
    "options": [
      "1857",
      "1905",
      "1919",
      "1942"
    ],
    "correct": 0,
    "proof": 67,
    "headline": "1857 uprising",
    "news": "The 1857 uprising is often called India's First War of Independence.",
    "explain": "1857."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state shares a border with China and Nepal among Himalayan states?",
    "options": [
      "Goa",
      "Sikkim",
      "Kerala",
      "Gujarat"
    ],
    "correct": 1,
    "proof": 62,
    "headline": "Sikkim Himalayan borders",
    "news": "Sikkim borders China (Tibet) and Nepal in the eastern Himalayas.",
    "explain": "Sikkim."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Who was the first Indian woman in space?",
    "options": [
      "Kalpana Chawla",
      "Sunita Williams only US Navy",
      "Tessy Thomas",
      "Indira Gandhi"
    ],
    "correct": 0,
    "proof": 49,
    "headline": "Kalpana Chawla in space",
    "news": "Kalpana Chawla was the first woman of Indian origin in space.",
    "explain": "Kalpana Chawla."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian river forms a delta with the Bay of Bengal famously with Hugli?",
    "options": [
      "Narmada",
      "Ganga",
      "Luni",
      "Mahi"
    ],
    "correct": 1,
    "proof": 59,
    "headline": "Ganga delta",
    "news": "The Ganga forms a vast delta region before meeting the Bay of Bengal.",
    "explain": "Ganga."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "The Election Commission of India is a?",
    "options": [
      "Private NGO",
      "Constitutional body",
      "State corporation",
      "Municipal office"
    ],
    "correct": 1,
    "proof": 54,
    "headline": "ECI constitutional body",
    "news": "The Election Commission of India is a constitutional body.",
    "explain": "Constitutional body."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian city is famous for Mysore Palace?",
    "options": [
      "Mysuru",
      "Madurai",
      "Kochi",
      "Coimbatore"
    ],
    "correct": 0,
    "proof": 55,
    "headline": "Mysuru Palace",
    "news": "Mysuru (Mysore) is famous for the Mysore Palace.",
    "explain": "Mysuru."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Operation Flood is related to?",
    "options": [
      "Milk production",
      "Flood control dams only",
      "Oil refining",
      "Coal mining"
    ],
    "correct": 0,
    "proof": 72,
    "headline": "Operation Flood dairy",
    "news": "Operation Flood transformed India's dairy sector and milk production.",
    "explain": "Milk production."
  },
  {
    "category": "India",
    "personal": false,
    "sound": "default",
    "q": "Which Indian state was formed in 2000 along with Jharkhand and Uttarakhand?",
    "options": [
      "Telangana",
      "Chhattisgarh",
      "Goa",
      "Sikkim"
    ],
    "correct": 1,
    "proof": 58,
    "headline": "Chhattisgarh formed 2000",
    "news": "Chhattisgarh was formed in 2000 (with Jharkhand and Uttarakhand).",
    "explain": "Chhattisgarh."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country has the largest population as of mid-2020s estimates often cited?",
    "options": [
      "USA",
      "India",
      "Russia",
      "Brazil"
    ],
    "correct": 1,
    "proof": 62,
    "headline": "India population lead",
    "news": "India surpassed China as the world's most populous country in recent estimates.",
    "explain": "India."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The United Nations headquarters is in?",
    "options": [
      "Geneva",
      "New York",
      "Paris",
      "Vienna"
    ],
    "correct": 1,
    "proof": 54,
    "headline": "UN HQ New York",
    "news": "The United Nations headquarters is in New York City.",
    "explain": "New York."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which ocean is the largest?",
    "options": [
      "Atlantic",
      "Indian",
      "Arctic",
      "Pacific"
    ],
    "correct": 3,
    "proof": 57,
    "headline": "Pacific largest ocean",
    "news": "The Pacific Ocean is the world's largest ocean.",
    "explain": "Pacific."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Brexit refers to?",
    "options": [
      "Britain exiting the EU",
      "Brazil joining NATO",
      "Belgium currency change",
      "Bangladesh trade deal only"
    ],
    "correct": 0,
    "proof": 59,
    "headline": "Brexit = UK leave EU",
    "news": "Brexit is the United Kingdom's withdrawal from the European Union.",
    "explain": "Britain exiting the EU."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country gifted the Statue of Liberty to the USA?",
    "options": [
      "UK",
      "France",
      "Spain",
      "Italy"
    ],
    "correct": 1,
    "proof": 70,
    "headline": "France gifted Liberty",
    "news": "France gifted the Statue of Liberty to the United States.",
    "explain": "France."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The Great Wall is associated with?",
    "options": [
      "Japan",
      "China",
      "Korea",
      "Mongolia only"
    ],
    "correct": 1,
    "proof": 50,
    "headline": "Great Wall of China",
    "news": "The Great Wall is a historic fortification system in China.",
    "explain": "China."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which African river is the world's longest often debated with Amazon?",
    "options": [
      "Congo",
      "Nile",
      "Zambezi",
      "Niger"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "Nile among longest",
    "news": "The Nile is traditionally regarded as the world's longest river.",
    "explain": "Nile."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "NATO is primarily a?",
    "options": [
      "Trade bloc only",
      "Military alliance",
      "Football league",
      "Currency union only"
    ],
    "correct": 1,
    "proof": 69,
    "headline": "NATO military alliance",
    "news": "NATO is a collective defence military alliance.",
    "explain": "Military alliance."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which city is Japan's capital?",
    "options": [
      "Osaka",
      "Tokyo",
      "Kyoto",
      "Nagoya"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Tokyo capital",
    "news": "Tokyo is the capital of Japan.",
    "explain": "Tokyo."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The Cold War was mainly between?",
    "options": [
      "USA and USSR",
      "India and China only",
      "Brazil and Argentina",
      "Egypt and Turkey only"
    ],
    "correct": 0,
    "proof": 74,
    "headline": "Cold War USA–USSR",
    "news": "The Cold War was a prolonged geopolitical rivalry between the USA and the USSR.",
    "explain": "USA and USSR."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which desert is the largest hot desert?",
    "options": [
      "Gobi",
      "Sahara",
      "Atacama",
      "Mojave"
    ],
    "correct": 1,
    "proof": 55,
    "headline": "Sahara largest hot desert",
    "news": "The Sahara is the world's largest hot desert.",
    "explain": "Sahara."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "WHO stands for?",
    "options": [
      "World Health Organization",
      "World Heritage Office",
      "Western Hemisphere Order",
      "World Housing Org"
    ],
    "correct": 0,
    "proof": 57,
    "headline": "WHO health body",
    "news": "The World Health Organization is the UN's health agency.",
    "explain": "World Health Organization."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country hosted the 2024 Summer Olympics?",
    "options": [
      "USA",
      "France",
      "Japan",
      "Australia"
    ],
    "correct": 1,
    "proof": 62,
    "headline": "Paris 2024 Olympics",
    "news": "Paris, France hosted the 2024 Summer Olympic Games.",
    "explain": "France."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The Amazon rainforest is mostly in?",
    "options": [
      "Africa",
      "South America",
      "Australia",
      "Europe"
    ],
    "correct": 1,
    "proof": 51,
    "headline": "Amazon in South America",
    "news": "Most of the Amazon rainforest lies in South America, especially Brazil.",
    "explain": "South America."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which currency is used in the Eurozone?",
    "options": [
      "Pound",
      "Euro",
      "Franc only",
      "Lira only"
    ],
    "correct": 1,
    "proof": 55,
    "headline": "Euro currency",
    "news": "Eurozone countries share the euro as their common currency.",
    "explain": "Euro."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Mandela was a leader in?",
    "options": [
      "Kenya",
      "South Africa",
      "Nigeria",
      "Ghana"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Mandela South Africa",
    "news": "Nelson Mandela led South Africa's anti-apartheid struggle and became president.",
    "explain": "South Africa."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which strait separates Asia and North America near Alaska?",
    "options": [
      "Gibraltar",
      "Bering Strait",
      "Malacca",
      "Hormuz"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Bering Strait",
    "news": "The Bering Strait separates Asia (Russia) from North America (Alaska).",
    "explain": "Bering Strait."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The IMF primarily deals with?",
    "options": [
      "Sports rankings",
      "International monetary cooperation",
      "Film awards",
      "Wildlife parks"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "IMF monetary body",
    "news": "The International Monetary Fund promotes global monetary cooperation and financial stability.",
    "explain": "International monetary cooperation."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which Middle East city is holy to Judaism, Christianity and Islam?",
    "options": [
      "Dubai",
      "Jerusalem",
      "Doha",
      "Muscat"
    ],
    "correct": 1,
    "proof": 49,
    "headline": "Jerusalem sacred city",
    "news": "Jerusalem is sacred to Judaism, Christianity and Islam.",
    "explain": "Jerusalem."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Climate COP conferences are organised under?",
    "options": [
      "FIFA",
      "UNFCCC framework",
      "WTO only",
      "NATO"
    ],
    "correct": 1,
    "proof": 60,
    "headline": "COP under UNFCCC",
    "news": "UN climate COPs are held under the UN Framework Convention on Climate Change.",
    "explain": "UNFCCC framework."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country is both in Europe and Asia?",
    "options": [
      "Portugal",
      "Turkey",
      "Ireland",
      "Iceland"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "Turkey spans continents",
    "news": "Turkey has territory in both Europe and Asia.",
    "explain": "Turkey."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The Suez Canal connects?",
    "options": [
      "Atlantic and Pacific",
      "Mediterranean and Red Sea",
      "Black Sea and Caspian",
      "North Sea and Baltic only"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Suez links seas",
    "news": "The Suez Canal connects the Mediterranean Sea with the Red Sea.",
    "explain": "Mediterranean and Red Sea."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which pandemic disease dominated global headlines in 2020?",
    "options": [
      "Polio only",
      "COVID-19",
      "Malaria only",
      "Cholera only"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "COVID-19 pandemic",
    "news": "COVID-19 caused a global pandemic beginning in 2019–2020.",
    "explain": "COVID-19."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Canada's capital is?",
    "options": [
      "Toronto",
      "Ottawa",
      "Vancouver",
      "Montreal"
    ],
    "correct": 1,
    "proof": 69,
    "headline": "Ottawa capital",
    "news": "Ottawa is the capital of Canada.",
    "explain": "Ottawa."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which organisation awards the Nobel Peace Prize?",
    "options": [
      "UN General Assembly",
      "Norwegian Nobel Committee",
      "US Congress",
      "EU Parliament"
    ],
    "correct": 1,
    "proof": 64,
    "headline": "Norwegian Nobel Committee",
    "news": "The Nobel Peace Prize is awarded by the Norwegian Nobel Committee.",
    "explain": "Norwegian Nobel Committee."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Mount Kilimanjaro is in?",
    "options": [
      "Kenya only exclusive",
      "Tanzania",
      "Egypt",
      "Morocco"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Kilimanjaro in Tanzania",
    "news": "Mount Kilimanjaro is located in Tanzania.",
    "explain": "Tanzania."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country is the largest by area?",
    "options": [
      "China",
      "Canada",
      "Russia",
      "USA"
    ],
    "correct": 2,
    "proof": 60,
    "headline": "Russia largest by area",
    "news": "Russia is the world's largest country by land area.",
    "explain": "Russia."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The Berlin Wall fell in?",
    "options": [
      "1961",
      "1989",
      "1999",
      "2001"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Berlin Wall 1989",
    "news": "The Berlin Wall fell in 1989, a landmark end-of-Cold-War moment.",
    "explain": "1989."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which Asian country is an archipelago of thousands of islands?",
    "options": [
      "Mongolia",
      "Indonesia",
      "Nepal",
      "Afghanistan"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "Indonesia archipelago",
    "news": "Indonesia is the world's largest archipelagic country.",
    "explain": "Indonesia."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "G7 is a group of?",
    "options": [
      "Developing islands only",
      "Major advanced economies",
      "Cricket boards",
      "Oil-only states always"
    ],
    "correct": 1,
    "proof": 66,
    "headline": "G7 advanced economies",
    "news": "The G7 comprises major advanced economies coordinating on global issues.",
    "explain": "Major advanced economies."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which canal links the Atlantic and Pacific via Central America?",
    "options": [
      "Suez",
      "Panama Canal",
      "Kiel",
      "Corinth"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "Panama Canal",
    "news": "The Panama Canal connects the Atlantic and Pacific Oceans.",
    "explain": "Panama Canal."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The capital of France is?",
    "options": [
      "Lyon",
      "Paris",
      "Marseille",
      "Nice"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Paris capital",
    "news": "Paris is the capital of France.",
    "explain": "Paris."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which gas is the main driver discussed in global warming?",
    "options": [
      "Oxygen",
      "Carbon dioxide",
      "Nitrogen only",
      "Helium"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "CO2 and warming",
    "news": "Carbon dioxide is a primary greenhouse gas linked to global warming.",
    "explain": "Carbon dioxide."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "South Korea's capital is?",
    "options": [
      "Busan",
      "Seoul",
      "Incheon",
      "Pyongyang"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Seoul capital",
    "news": "Seoul is the capital of South Korea.",
    "explain": "Seoul."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The Antarctic Treaty system aims to?",
    "options": [
      "Mine coal freely",
      "Keep Antarctica for peaceful scientific use",
      "Build cities only",
      "Host Olympics only"
    ],
    "correct": 1,
    "proof": 52,
    "headline": "Antarctica for science peace",
    "news": "The Antarctic Treaty promotes peaceful scientific cooperation and limits militarisation.",
    "explain": "Keep Antarctica for peaceful scientific use."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country is known for the fjords tourism brand strongly?",
    "options": [
      "Saudi Arabia",
      "Norway",
      "Chad",
      "Paraguay"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "Norway fjords",
    "news": "Norway is world-famous for its fjord landscapes.",
    "explain": "Norway."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "OPEC+ expands OPEC coordination with?",
    "options": [
      "Non-OPEC oil producers",
      "Only tech firms",
      "Only airlines",
      "Only banks"
    ],
    "correct": 0,
    "proof": 46,
    "headline": "OPEC+ with other producers",
    "news": "OPEC+ includes additional non-OPEC oil-producing countries coordinating supply.",
    "explain": "Non-OPEC oil producers."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which city hosted the first modern Olympics in 1896?",
    "options": [
      "Rome",
      "Athens",
      "London",
      "Paris"
    ],
    "correct": 1,
    "proof": 68,
    "headline": "Athens 1896 Olympics",
    "news": "The first modern Olympic Games were held in Athens in 1896.",
    "explain": "Athens."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The capital of Egypt is?",
    "options": [
      "Alexandria",
      "Cairo",
      "Giza only",
      "Luxor"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Cairo capital",
    "news": "Cairo is the capital of Egypt.",
    "explain": "Cairo."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which conflict involves Ukraine and Russia from 2022 escalation?",
    "options": [
      "Full-scale war following Russia's invasion",
      "Only trade tariff spat",
      "Only football ban",
      "Only space race"
    ],
    "correct": 0,
    "proof": 73,
    "headline": "Russia–Ukraine war",
    "news": "Russia's 2022 full-scale invasion of Ukraine triggered a major European war.",
    "explain": "Full-scale war following Russia's invasion."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "ASEAN is a regional group in?",
    "options": [
      "South America",
      "Southeast Asia",
      "Central Africa",
      "Nordic Europe"
    ],
    "correct": 1,
    "proof": 45,
    "headline": "ASEAN Southeast Asia",
    "news": "ASEAN is the Association of Southeast Asian Nations.",
    "explain": "Southeast Asia."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which planet is called the Red Planet?",
    "options": [
      "Venus",
      "Mars",
      "Jupiter",
      "Saturn"
    ],
    "correct": 1,
    "proof": 54,
    "headline": "Mars Red Planet",
    "news": "Mars is commonly called the Red Planet.",
    "explain": "Mars."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The capital of Brazil is?",
    "options": [
      "Rio de Janeiro",
      "Brasília",
      "São Paulo",
      "Salvador"
    ],
    "correct": 1,
    "proof": 74,
    "headline": "Brasília capital",
    "news": "Brasília is the capital of Brazil.",
    "explain": "Brasília."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which organisation settles many international trade disputes?",
    "options": [
      "FIFA",
      "WTO",
      "IOC",
      "UNESCO only"
    ],
    "correct": 1,
    "proof": 44,
    "headline": "WTO trade disputes",
    "news": "The World Trade Organization handles many international trade dispute cases.",
    "explain": "WTO."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The Dead Sea border region is associated with?",
    "options": [
      "Nepal–China",
      "Israel/Jordan area",
      "Chile–Peru only",
      "Norway–Sweden only"
    ],
    "correct": 1,
    "proof": 62,
    "headline": "Dead Sea region",
    "news": "The Dead Sea lies along the Israel–Jordan border region.",
    "explain": "Israel/Jordan area."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country launched Sputnik, the first artificial satellite?",
    "options": [
      "USA",
      "USSR",
      "China",
      "France"
    ],
    "correct": 1,
    "proof": 46,
    "headline": "USSR Sputnik",
    "news": "The Soviet Union launched Sputnik 1 in 1957.",
    "explain": "USSR."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The capital of Kenya is?",
    "options": [
      "Mombasa",
      "Nairobi",
      "Kisumu",
      "Nakuru"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Nairobi capital",
    "news": "Nairobi is the capital of Kenya.",
    "explain": "Nairobi."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Human rights are globally framed in 1948 by?",
    "options": [
      "UDHR",
      "Only Geneva sports code",
      "Only Bretton Woods hotels",
      "Only Olympic charter"
    ],
    "correct": 0,
    "proof": 53,
    "headline": "UDHR 1948",
    "news": "The Universal Declaration of Human Rights was adopted in 1948.",
    "explain": "UDHR."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which European mountain range includes Mont Blanc?",
    "options": [
      "Andes",
      "Alps",
      "Rockies",
      "Himalayas"
    ],
    "correct": 1,
    "proof": 66,
    "headline": "Alps and Mont Blanc",
    "news": "Mont Blanc is in the Alps mountain range.",
    "explain": "Alps."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Taiwan is located off the coast of?",
    "options": [
      "India",
      "China",
      "Australia",
      "Russia"
    ],
    "correct": 1,
    "proof": 51,
    "headline": "Taiwan near China",
    "news": "Taiwan is an island off the southeastern coast of China.",
    "explain": "China."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The capital of Spain is?",
    "options": [
      "Barcelona",
      "Madrid",
      "Seville",
      "Valencia"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Madrid capital",
    "news": "Madrid is the capital of Spain.",
    "explain": "Madrid."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which African country has Cairo?",
    "options": [
      "Sudan",
      "Egypt",
      "Libya",
      "Ethiopia"
    ],
    "correct": 1,
    "proof": 48,
    "headline": "Cairo in Egypt",
    "news": "Cairo is in Egypt.",
    "explain": "Egypt."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "The International Court of Justice is in?",
    "options": [
      "New York",
      "The Hague",
      "Geneva only UNHRC",
      "Paris"
    ],
    "correct": 1,
    "proof": 57,
    "headline": "ICJ in The Hague",
    "news": "The International Court of Justice sits in The Hague, Netherlands.",
    "explain": "The Hague."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "Which country is the largest producer of coffee historically often cited in Latin America?",
    "options": [
      "Chile",
      "Brazil",
      "Argentina",
      "Uruguay"
    ],
    "correct": 1,
    "proof": 73,
    "headline": "Brazil coffee giant",
    "news": "Brazil is the world's largest coffee producer.",
    "explain": "Brazil."
  },
  {
    "category": "World",
    "personal": false,
    "sound": "default",
    "q": "G20 brings together?",
    "options": [
      "Only 20 villages",
      "Major economies and the EU",
      "Only cricket nations",
      "Only island states"
    ],
    "correct": 1,
    "proof": 69,
    "headline": "G20 major economies",
    "news": "The G20 includes major advanced and emerging economies plus the European Union.",
    "explain": "Major economies and the EU."
  }
];
