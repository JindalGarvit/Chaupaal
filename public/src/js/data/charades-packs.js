/**
 * Charades title packs (Dangal G2, global-first pass P15). Teen-safe titles only; famous people are
 * historical or widely admired public figures (living-person-safe).
 * Row: 'English|hindi|difficulty[|alt1,alt2]' — difficulty e (easy) · m (medium) · h (hard).
 *   the Hindi slot stays '' here — Hindi lives in data/locales/hi/charades-packs.hi.js (applyLocale);
 *   the Hindi UI shows English where a title has none.
 * Global core: Movies · Songs · TV Shows · Famous People · Actions · Animals · Idioms.
 * `regional` packs are optional add-ons (Bollywood Movies/Songs, Indian TV, Cricket & Indian Sports,
 * Hindi Idioms): on by default only for region 'in' / Hindi readers.
 * A leading '@' marks an India-specific title inside a global pack; it is dealt only for region 'in',
 * a Hindi reader, or when a regional pack is also selected (see CharadesCore.pool).
 * Keys are `pack:titleId(english)` so the bad-card retire list survives edits.
 * UMD: window.CHARADES_PACKS / require().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CHARADES_PACKS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAW = [
    {
      id: 'bollywood',
      en: 'Bollywood Movies',
      hi: '',
      icon: '🎬',
      kind: 'movie',
      regional: true,
      rows: [
        'Sholay||e', 'Dilwale Dulhania Le Jayenge||e|DDLJ', 'Kuch Kuch Hota Hai||e|KKHH',
        '3 Idiots||e|three idiots', 'Lagaan||e', 'Dangal||e', 'PK||e', 'Taare Zameen Par||e',
        'Kabhi Khushi Kabhie Gham||e|K3G,kabhi khushi kabhi gham', 'Chak De India||e', 'Mother India||e',
        'Bajrangi Bhaijaan||e', 'Krrish||e|krish', 'Koi Mil Gaya||e', 'Dhoom||e', 'Don||e',
        'Hum Aapke Hain Koun||m', 'Munna Bhai MBBS||e', 'Lage Raho Munna Bhai||m',
        'Chennai Express||e', 'Om Shanti Om||e', 'Kal Ho Naa Ho||e|kal ho na ho', 'Main Hoon Na||e',
        'Baahubali||e|bahubali', 'RRR||e', 'Pathaan||e|pathan', 'Jawan||e', 'Sultan||e', 'Tiger Zinda Hai||e',
        'Ek Tha Tiger||e', 'Dabangg||e|dabang', 'Singham||e', 'Golmaal||e', 'Hera Pheri||e', 'Queen||e',
        'Andaz Apna Apna||m', 'Jab We Met||e', 'Zindagi Na Milegi Dobara||m|ZNMD',
        'Yeh Jawaani Hai Deewani||m|yjhd', 'Dil Chahta Hai||m', 'Rang De Basanti||m', 'Border||e',
        'Gadar||e', 'Kaho Naa Pyaar Hai||e|kaho na pyar hai', 'Mohabbatein||e', 'Devdas||e', 'Padmaavat||m|padmavat',
        'Bajirao Mastani||m', 'Chhichhore||m|chhichore', 'Stree||e', 'Bhool Bhulaiyaa||e|bhool bhulaiya',
        'Andhadhun||m', 'Drishyam||m', 'Kahaani||m|kahani', 'Barfi||e', 'Swades||m', 'Dil To Pagal Hai||e',
        'Jodhaa Akbar||m|jodha akbar', 'Mughal-E-Azam||m|mughal e azam', 'Gully Boy||e', 'Uri||m', 'Shershaah||m|shershah',
        '83||m|eighty three', 'Brahmastra||m', 'Tanhaji||m', 'Laal Singh Chaddha||m',
        'Rocky Aur Rani Kii Prem Kahaani||h|rocky aur rani ki prem kahani', '12th Fail||m|twelfth fail',
        'Laapataa Ladies||m|lapata ladies', 'Dunki||m', 'Stree 2||m', 'Fighter||e', 'War||e', 'Super 30||m',
        'Kesari||m', 'Mission Mangal||m', 'Badhaai Ho||m|badhai ho', 'Piku||m', 'Hindi Medium||m',
        'Bhaag Milkha Bhaag||e', 'Mary Kom||e', 'M.S. Dhoni: The Untold Story||m|ms dhoni',
        'Raazi||m|raazi', 'Tumbbad||h|tumbad', 'The Lunchbox||h|lunchbox', 'Udaan||h', 'Wake Up Sid||m',
        'Rockstar||e', 'Tamasha||m', 'Dil Dhadakne Do||m', 'Kapoor & Sons||h|kapoor and sons',
        'English Vinglish||m', 'Paa||m', 'Black||m', 'Fanaa||m|fana', 'Veer-Zaara||m|veer zaara', 'Karan Arjun||e',
        'Baazigar||m|bazigar', 'Mr. India||e|mister india', 'Deewaar||m|deewar', 'Zanjeer||m', 'Anand||m', 'Guide||h',
        'Pakeezah||h|pakeeza', 'Chupke Chupke||h', 'Amar Akbar Anthony||m', 'Namak Halaal||h|namak halal',
        'Coolie||m', 'Agneepath||m', 'Silsila||h', 'Maine Pyar Kiya||m', 'Qayamat Se Qayamat Tak||h|QSQT',
        'Hum Dil De Chuke Sanam||m', 'Dil Se||m', 'Rangeela||m', 'Jo Jeeta Wohi Sikandar||h',
        'Jaane Tu Ya Jaane Na||m', 'Rab Ne Bana Di Jodi||m', 'Ra.One||m|ra one', 'Airlift||m',
        'Special 26||h', 'A Wednesday||h', 'Ghajini||e', 'Fukrey||m', 'Welcome||e', 'Dhamaal||e',
        'Housefull||e', 'Phir Hera Pheri||m', 'OMG: Oh My God||m|oh my god,omg', 'Dream Girl||e',
        'Tubelight||m', 'Prem Ratan Dhan Payo||h', 'Hum Saath-Saath Hain||m|hum saath saath hain',
        'Bodyguard||e', 'Jolly LLB||m', 'Kai Po Che||h', 'Sanju||m', 'Pushpa||e',
      ],
    },
    {
      id: 'songs',
      en: 'Bollywood Songs',
      hi: '',
      icon: '🎤',
      kind: 'song',
      regional: true,
      rows: [
        'Tujhe Dekha To||e', 'Chaiyya Chaiyya||e|chaiya chaiya', 'Tum Hi Ho||e', 'Kesariya||e', 'Jai Ho||e',
        'Mere Sapno Ki Rani||m', 'Pal Pal Dil Ke Paas||m', 'Lag Ja Gale||m', 'Ek Do Teen||e',
        'Yeh Dosti||e', 'Kajra Re||m', 'Dhoom Machale||e', 'Balam Pichkari||m', 'Gallan Goodiyaan||h',
        'London Thumakda||m', 'Nagada Sang Dhol||m', 'Malhari||h', 'Ghoomar||m', 'Badtameez Dil||m',
        'Senorita||m', 'Naatu Naatu||e|naacho naacho', 'Srivalli||m', 'Jhoome Jo Pathaan||m', 'Chaleya||m',
        'Apna Bana Le||m', 'Raataan Lambiyan||m', 'Tera Ban Jaunga||m', 'Channa Mereya||m',
        'Agar Tum Saath Ho||m', 'Tum Se Hi||m', 'Kabira||m', 'Ilahi||h', 'Kun Faya Kun||h',
        'Chammak Challo||e', 'Desi Girl||e', 'Kala Chashma||e', 'Lungi Dance||e', 'Mauja Hi Mauja||m',
        'Aankh Marey||m', 'Swag Se Swagat||m', 'Jag Ghoomeya||h', 'Gerua||m', 'Janam Janam||m',
        'Tum Tak||h', 'Kaun Tujhe||m', 'Dil Diyan Gallan||m', 'Mere Dholna||m', 'Suraj Hua Maddham||h',
        'Tujh Mein Rab Dikhta Hai||m', 'Zoobi Doobi||m', 'Give Me Some Sunshine||m', 'All Izz Well||e|all is well',
        'Pappu Cant Dance||m|pappu can\'t dance', 'Chura Liya Hai Tumne||h', 'Yeh Shaam Mastani||h',
        'Zindagi Ek Safar||h', 'Jimmy Jimmy||e', 'I Am a Disco Dancer||e|disco dancer',
        'Didi Tera Devar Deewana||m', 'Maahi Ve||m', 'Saathiya||m', 'Kuch Na Kaho||h',
        'Ruk Ja O Dil Deewane||m', 'Hawayein||m', 'Phir Bhi Tumko Chaahunga||h', 'Ghungroo||m',
        'Sadda Haq||m', 'Abhi Mujh Mein Kahin||h', 'Masakali||m', 'Bum Bum Bole||m',
      ],
    },
    {
      id: 'hollywood',
      en: 'Movies',
      hi: '',
      icon: '🍿',
      kind: 'movie',
      rows: [
        'Titanic||e', 'Avatar||e', 'Jurassic Park||e', 'The Lion King||e', 'Frozen||e', 'Finding Nemo||e',
        'Toy Story||e', 'Harry Potter||e', 'Star Wars||e', 'Spider-Man||e|spiderman', 'Iron Man||e',
        'The Avengers||e|avengers', 'Black Panther||m', 'The Dark Knight||m|batman', 'Superman||e',
        'Wonder Woman||e', 'Shrek||e', 'Home Alone||e', 'Jaws||m', 'E.T.||m|et', 'Back to the Future||m',
        'Indiana Jones||m', 'The Wizard of Oz||m', 'Mary Poppins||m', 'The Sound of Music||h',
        'Up||m', 'Inside Out||m', 'Coco||m', 'Moana||e', 'Aladdin||e', 'Beauty and the Beast||e',
        'Cinderella||e', 'Kung Fu Panda||e', 'Madagascar||e', 'Ice Age||e', 'Minions||e',
        'Despicable Me||m', 'Cars||e', 'Ratatouille||h', 'WALL-E||m|wall e', 'Monsters, Inc.||m|monsters inc',
        'The Incredibles||m', 'Zootopia||m', 'Encanto||m', 'The Jungle Book||e', 'Pirates of the Caribbean||m',
        'The Lord of the Rings||m', 'The Hobbit||m', 'Transformers||e', 'Men in Black||e',
        'Ghostbusters||m', 'Mission: Impossible||e|mission impossible', 'Top Gun||m', 'Forrest Gump||m',
        'Rocky||e', 'Jumanji||e', 'Night at the Museum||m', 'Barbie||e', 'Inception||h', 'Interstellar||h',
        'Gravity||m', 'The Martian||h', 'Charlie and the Chocolate Factory||m', 'Matilda||m',
        'Paddington||m', 'King Kong||e', 'Godzilla||e', 'Pinocchio||m', 'Mulan||m', 'Tarzan||e',
        'The Little Mermaid||m', 'Tangled||m', 'Big Hero 6||m',
      ],
    },
    {
      id: 'tv',
      en: 'TV Shows',
      hi: '',
      icon: '📺',
      kind: 'tv',
      rows: [
        'Friends||e', 'The Office||m', 'Stranger Things||m', 'Sherlock||m', 'Doctor Who||h', 'Mr. Bean||e|mister bean',
        'The Simpsons||m', 'SpongeBob SquarePants||e|spongebob', 'Tom and Jerry||e', 'Pokémon||e|pokemon',
        'Doraemon||e', 'Shinchan||e', 'Shark Tank||m', 'MasterChef||e',
        'Wednesday||m', 'The Crown||h', 'Modern Family||m', 'The Big Bang Theory||m',
        'Brooklyn Nine-Nine||h|brooklyn 99', 'The Mandalorian||h', 'Avatar: The Last Airbender||h|avatar last airbender',
        'Peppa Pig||e', 'Bluey||m', 'Ben 10||e', 'Scooby-Doo||e|scooby doo',
        'Sesame Street||e', 'The Muppets||e|muppet show', 'Looney Tunes||e', 'Paw Patrol||e', 'The Flintstones||m', 'The Pink Panther||m|pink panther',
        'Teenage Mutant Ninja Turtles||m|ninja turtles', 'Power Rangers||e', 'Seinfeld||h', 'How I Met Your Mother||m', 'Survivor||m',
        'Who Wants to Be a Millionaire||m|millionaire', 'Wheel of Fortune||m', 'Top Gear||m', 'Planet Earth||h', 'The Great British Bake Off||h|bake off',
        'Phineas and Ferb||m', 'Gravity Falls||h', 'Dora the Explorer||e|dora', 'Masha and the Bear||e', 'Naruto||m', 'Dragon Ball||m|dragon ball z',
      ],
    },
    {
      id: 'desitv',
      en: 'Indian TV',
      hi: '',
      icon: '📡',
      kind: 'tv',
      regional: true,
      rows: [
        'Mahabharat||e', 'Ramayan||e', 'Kaun Banega Crorepati||e|KBC',
        'Taarak Mehta Ka Ooltah Chashmah||m|tmkoc,taarak mehta', 'Shaktimaan||e', 'Malgudi Days||h',
        'Chhota Bheem||e', 'Motu Patlu||e', 'Panchayat||m', 'Kota Factory||m', 'Aspirants||h', 'Gullak||h',
        'Indian Idol||e', 'Sarabhai vs Sarabhai||m', 'Hum Paanch||h', 'Office Office||h',
        'Byomkesh Bakshi||h', 'Chandrakanta||h', 'Vikram Aur Betaal||m', 'Alif Laila||h', 'CID||e',
        'Bigg Boss||e', 'Roadies||m', 'The Kapil Sharma Show||e|kapil sharma show', 'Khichdi||m', 'Dekh Bhai Dekh||h',
        'Shrimaan Shrimati||h', 'Jassi Jaissi Koi Nahin||h', 'Dance India Dance||m', 'Sa Re Ga Ma Pa||e',
        'Son Pari||m', 'Shararat||m', 'Baal Veer||m', 'Rangoli||h', 'Chitrahaar||h', 'Surabhi||h',
        'Balika Vadhu||m', 'Anupamaa||m', 'Tu Tu Main Main||h', 'Hero – Bhakti Hi Shakti Hai||h|hero',
      ],
    },
    {
      id: 'sports',
      en: 'Cricket & Indian Sports Stars',
      hi: '',
      icon: '🏏',
      kind: 'person',
      regional: true,
      rows: [
        '@Sachin Tendulkar||e', '@Virat Kohli||e', '@MS Dhoni||e|dhoni,mahendra singh dhoni', '@Rohit Sharma||e',
        '@Kapil Dev||m', '@Sunil Gavaskar||m', '@Sourav Ganguly||m', '@Rahul Dravid||m', '@Anil Kumble||m',
        '@Yuvraj Singh||m', '@Virender Sehwag||m', '@Jasprit Bumrah||m', '@Hardik Pandya||m',
        '@Ravindra Jadeja||m', '@Smriti Mandhana||h', '@Mithali Raj||h', '@Harmanpreet Kaur||h',
        '@Shubman Gill||m', '@Rishabh Pant||m', '@Suryakumar Yadav||h', 'Shane Warne||m', 'Brian Lara||m',
        'Don Bradman||h', 'Ricky Ponting||h', 'AB de Villiers||h', 'Chris Gayle||m',
        'Muttiah Muralitharan||h', 'Ben Stokes||h', '@Neeraj Chopra||m', '@PV Sindhu||m', '@Saina Nehwal||m',
        '@Milkha Singh||m', '@PT Usha||h', '@Sunil Chhetri||h', '@Dhyan Chand||h', '@Abhinav Bindra||h',
        '@Sania Mirza||m', '@Viswanathan Anand||h', '@Mary Kom||m', '@Leander Paes||h',
        'Jacques Kallis||h', 'Kane Williamson||h', 'Joe Root||h', 'Steve Smith||h', 'Wasim Akram||m',
      ],
    },
    {
      id: 'people',
      en: 'Famous People',
      hi: '',
      icon: '🌟',
      kind: 'person',
      rows: [
        'Albert Einstein||e|einstein', 'Cleopatra||e', 'Leonardo da Vinci||m|da vinci', 'William Shakespeare||e|shakespeare', 'Napoleon||m|napoleon bonaparte',
        'Mozart||m|wolfgang amadeus mozart', 'Beethoven||m|ludwig van beethoven', 'Isaac Newton||e|newton', 'Marie Curie||m', 'Mahatma Gandhi||e|gandhi',
        'Nelson Mandela||m|mandela', 'Abraham Lincoln||m|lincoln', 'Martin Luther King Jr.||m|martin luther king,mlk', 'Charlie Chaplin||e|chaplin',
        'Elvis Presley||m|elvis', 'Michael Jackson||e', 'Frida Kahlo||h', 'Vincent van Gogh||m|van gogh', 'Pablo Picasso||m|picasso', 'Queen Victoria||h',
        'Julius Caesar||m', 'Christopher Columbus||m|columbus', 'Neil Armstrong||e', 'Amelia Earhart||h', 'Galileo||h|galileo galilei', 'Charles Darwin||m|darwin',
        'Thomas Edison||m|edison', 'Walt Disney||e', 'Bruce Lee||e', 'Muhammad Ali||m', 'Pelé||m|pele', 'Freddie Mercury||m', 'John Lennon||m', 'Bob Marley||m',
        'Audrey Hepburn||h', 'Harry Houdini||m|houdini', 'Florence Nightingale||h', 'Joan of Arc||h', 'Tutankhamun||h|king tut', 'Genghis Khan||m',
        'Usain Bolt||e', 'Serena Williams||m', 'Roger Federer||m', 'Michael Jordan||m', 'Lionel Messi||e|messi', 'Cristiano Ronaldo||e|ronaldo',
        'Simone Biles||h', 'Michael Phelps||h', 'Diego Maradona||m|maradona', 'David Beckham||m|beckham',
      ],
    },
    {
      id: 'hits',
      en: 'Songs',
      hi: '',
      icon: '🎵',
      kind: 'song',
      rows: [
        'Happy Birthday||e', 'Twinkle Twinkle Little Star||e|twinkle twinkle', 'Jingle Bells||e', 'Let It Go||e', 'Hakuna Matata||e', 'Baby Shark||e',
        'We Will Rock You||e', 'Yellow Submarine||m', 'Bohemian Rhapsody||m', 'Thriller||e', 'Macarena||e', 'Gangnam Style||e', 'Despacito||m', 'Shape of You||m',
        'Happy||e', 'Dancing Queen||m', 'YMCA||e|y.m.c.a.', 'Hey Jude||m', 'Imagine||m', 'Don’t Worry, Be Happy||e|dont worry be happy', 'Old MacDonald Had a Farm||e|old macdonald',
        'Row, Row, Row Your Boat||e|row row row your boat', 'Head, Shoulders, Knees and Toes||e|head shoulders knees and toes', 'The Wheels on the Bus||e|wheels on the bus',
        'Under the Sea||m', 'Singin’ in the Rain||m|singing in the rain', 'Eye of the Tiger||m', 'Rolling in the Deep||h', 'Umbrella||m', 'Uptown Funk||m',
        'Shake It Off||m', 'Waka Waka||m', 'Wannabe||h', 'Billie Jean||m', 'Don’t Stop Believin’||h|dont stop believing', 'Stayin’ Alive||m|staying alive',
        'Hallelujah||h', 'Somewhere Over the Rainbow||m|over the rainbow', 'What a Wonderful World||m', 'Let It Be||m', 'All I Want for Christmas Is You||m',
        'Walking on Sunshine||h', 'Can’t Stop the Feeling||h|cant stop the feeling', 'I Will Survive||m',
      ],
    },
    {
      id: 'animals',
      en: 'Animals',
      hi: '',
      icon: '🐘',
      kind: 'animal',
      rows: [
        'Elephant||e', 'Monkey||e', 'Kangaroo||e', 'Penguin||e', 'Snake||e', 'Frog||e', 'Chicken||e', 'Cat||e', 'Dog||e', 'Lion||e', 'Giraffe||e', 'Crab||e',
        'Butterfly||e', 'Horse||e', 'Cow||e', 'Pig||e', 'Duck||e', 'Fish||e', 'Shark||e', 'Octopus||m', 'Bee||e', 'Spider||e', 'Gorilla||e', 'Bear||e',
        'Rabbit||e', 'Owl||m', 'Peacock||m', 'Dolphin||m', 'Turtle||m', 'Crocodile||m', 'Flamingo||m', 'Sloth||m', 'Camel||m', 'Seal||m', 'Squirrel||m',
        'T-Rex||m|t rex,dinosaur', 'Bat||m', 'Snail||m', 'Ostrich||h', 'Woodpecker||h', 'Jellyfish||h', 'Chameleon||h', 'Goat||m', 'Eagle||m', 'Worm||m',
        'Hedgehog||h', 'Scorpion||h', 'Mosquito||m',
      ],
    },
    {
      id: 'phrases',
      en: 'Idioms',
      hi: '',
      icon: '💬',
      kind: 'phrase',
      rows: [
        'Break a leg||m', 'Piece of cake||e', 'Raining cats and dogs||e', 'Spill the beans||e', 'Let the cat out of the bag||m', 'Hit the nail on the head||m',
        'Cold feet||m', 'Once in a blue moon||m', 'Under the weather||m', 'Cost an arm and a leg||m', 'Hit the sack||m', 'Barking up the wrong tree||h',
        'The ball is in your court||h', 'Burn the midnight oil||m', 'Cry over spilt milk||m', 'Time flies||e', 'Walk on eggshells||h', 'Beat around the bush||h',
        'Head in the clouds||e', 'Keep your eyes peeled||m', 'On cloud nine||m', 'Butterflies in your stomach||e', 'Elephant in the room||m',
        'Pull someone’s leg||m|pull your leg', 'Hold your horses||e', 'A penny for your thoughts||h', 'Actions speak louder than words||h', 'Back to square one||m',
        'Break the ice||e', 'Cat got your tongue||m', 'Cut corners||h', 'Face the music||h', 'Go the extra mile||m', 'In hot water||m', 'Jump on the bandwagon||h',
        'Miss the boat||m', 'Over the moon||e', 'Sit on the fence||m', 'Hit the road||e', 'Throw in the towel||m', 'Up in the air||m', 'When pigs fly||e',
        'Zip your lip||e', 'Let sleeping dogs lie||h', 'Add fuel to the fire||h', 'Get out of hand||m',
      ],
    },
    {
      id: 'idioms',
      en: 'Hindi Idioms',
      hi: '',
      icon: '🗣️',
      kind: 'phrase',
      regional: true,
      rows: [
        'Naach na jaane aangan tedha||m', 'Oont ke munh mein jeera||m',
        'Bandar kya jaane adrak ka swaad||e', 'Aasmaan se gira khajoor mein atka||m',
        'Ab pachhtaye hot kya jab chidiya chug gayi khet||h', 'Door ke dhol suhaane||m',
        'Ghar ki murgi daal barabar||e', 'Jal mein rehkar magar se bair||h',
        'Ulta chor kotwal ko daante||m', 'Kaala akshar bhains barabar||m', 'Naak mein dum karna||e',
        'Aankh ka taara||e', 'Hawa mein qile banana||m', 'Ungli par nachana||e', 'Paani paani hona||e',
        'Lohe ke chane chabana||m', 'Nau do gyarah hona||m', 'Aag babula hona||e', 'Daal mein kuch kaala hai||e',
        'Ek anaar sau beemar||m', 'Jitni chaadar utne pair pasaro||h',
        'Haathi ke daant khane ke aur dikhane ke aur||h', 'Aa bail mujhe maar||e',
        'Khisiyani billi khamba noche||h', 'Thotha chana baaje ghana||h', 'Jiski lathi uski bhains||m',
        'Ek teer se do shikar||e', 'Saanp bhi mar jaaye aur lathi bhi na toote||h',
        'Kutte ki dum tedhi ki tedhi||m', 'Chaar din ki chandni||m', 'Hatheli par sarson ugana||h',
        'Aankhon mein dhool jhonkna||m', 'Sau sunar ki ek lohar ki||h', 'Bhains ke aage been bajana||e',
        'Naya nau din purana sau din||h', 'Chor ki daadhi mein tinka||m', 'Oonchi dukaan pheeka pakwaan||m',
        'Der aaye durust aaye||e', 'Mann changa toh kathoti mein Ganga||h', 'Doobte ko tinke ka sahara||m',
        'Apni gali mein kutta bhi sher||e', 'Girgit ki tarah rang badalna||e', 'Pet mein chuhe daudna||e',
      ],
    },
    {
      id: 'actions',
      en: 'Everyday Actions',
      hi: '',
      icon: '🧹',
      kind: 'action',
      rows: [
        'Brushing teeth||e', 'Riding a bicycle||e', 'Flying a kite||e', '@Rolling a chapati||m|making roti',
        'Taking a selfie||e', 'Swimming||e', 'Washing clothes||e', 'Reading a newspaper||e', 'Climbing stairs||e',
        'Playing cricket||e', 'Dancing||e', 'Cooking||e', 'Driving a car||e', 'Catching a bus||m',
        'Tying shoelaces||m', 'Combing hair||e', 'Watering plants||e', 'Sweeping the floor||e',
        'Opening an umbrella||e', 'Drinking tea||e', 'Eating ice cream||e', 'Blowing up a balloon||e',
        'Sneezing||e', 'Yawning||e', 'Waking up||e', 'Taking a photo||e', 'Playing the guitar||e',
        'Playing the drums||e', 'Fishing||e', 'Skipping rope||e', 'Juggling||m', 'Painting a wall||m',
        'Walking a dog||e', 'Typing on a laptop||m', 'Talking on the phone||e', 'Ironing clothes||m',
        'Planting a tree||m', 'Building a sandcastle||m', 'Doing yoga||e', 'Lifting weights||e', 'Ice skating||m',
        'Rowing a boat||m', 'Chopping vegetables||e', 'Wrapping a gift||m', 'Blowing out candles||e',
        'Hanging clothes to dry||m', 'Changing a light bulb||h', 'Threading a needle||h',
      ],
    },
  ];

  const DIFF = { e: 'easy', m: 'medium', h: 'hard' };

  /** Stable title id: lowercase ASCII letters/digits of the English title (survives reordering). */
  function titleId(en) {
    return String(en)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  const PACKS = RAW.map((p) => ({
    id: p.id,
    en: p.en,
    hi: p.hi,
    icon: p.icon,
    kind: p.kind,
    regional: !!p.regional,
    titles: p.rows.map((row) => {
      const [raw, hi, d, alts] = row.split('|');
      const regional = !!p.regional || raw.charAt(0) === '@';
      const en = raw.replace(/^@/, '');
      return {
        key: p.id + ':' + titleId(en),
        en,
        hi: hi || '',
        difficulty: DIFF[d] || d,
        alts: alts ? alts.split(',').map((s) => s.trim()).filter(Boolean) : [],
        regional,
      };
    }),
  }));

  function getPack(id) {
    return PACKS.find((p) => p.id === id) || null;
  }

  /**
   * Default categories — the global core, plus the regional add-ons when the region is India
   * (`region === 'in'`, suggested for the India locale) or the reader uses Hindi.
   */
  function defaultCategories(lang, region) {
    const regional = region === 'in' || String(lang || 'en').indexOf('hi') === 0;
    return PACKS.filter((p) => regional || !p.regional).map((p) => p.id);
  }

  const BY_KEY = {};
  PACKS.forEach((p) => p.titles.forEach((t) => (BY_KEY[t.key] = Object.assign({ pack: p.id, kind: p.kind }, t))));

  function byKey(key) {
    return BY_KEY[key] || null;
  }

  /** Fill one language from its locale file (category names + titles, matched by English). */
  function applyLocale(lang, data) {
    if (!data || lang !== 'hi') return false;
    PACKS.forEach((p) => {
      const d = data.packs && data.packs[p.id];
      if (!d) return;
      if (d.name) p.hi = d.name;
      p.titles.forEach((t) => {
        if (d.items[t.en]) t.hi = d.items[t.en];
        if (BY_KEY[t.key]) BY_KEY[t.key].hi = t.hi;
      });
    });
    return true;
  }
  if (typeof module === 'object' && module.exports) {
    try {
      applyLocale('hi', require('./locales/hi/charades-packs.hi.js'));
    } catch (e) {}
  }

  return { PACKS, DIFFICULTIES: ['easy', 'medium', 'hard'], getPack, defaultCategories, byKey, titleId, applyLocale };
});
