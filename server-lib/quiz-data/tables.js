/**
 * Quiz Muqabala fact tables (Dangal P6) — evergreen, globally known facts. Server-only.
 * quiz-bank.js turns each row into one or more multiple-choice questions with distractors
 * drawn from the same table. Rows with contested or recently changed facts are left out
 * (e.g. disputed capitals, capitals being moved, currencies in transition).
 *
 * Tier = difficulty 1 (easy) · 2 (medium) · 3 (hard).
 */
'use strict';

// country | capital ('' = skip) | continent ('' = transcontinental, skip) | currency ('' = skip) | tier
const COUNTRIES = `
France|Paris|Europe|Euro|1
Germany|Berlin|Europe|Euro|1
Italy|Rome|Europe|Euro|1
Spain|Madrid|Europe|Euro|1
United Kingdom|London|Europe|Pound sterling|1
Portugal|Lisbon|Europe|Euro|1
Netherlands|Amsterdam|Europe|Euro|2
Belgium|Brussels|Europe|Euro|2
Switzerland|Bern|Europe|Swiss franc|2
Austria|Vienna|Europe|Euro|1
Ireland|Dublin|Europe|Euro|1
Greece|Athens|Europe|Euro|1
Sweden|Stockholm|Europe|Swedish krona|1
Norway|Oslo|Europe|Norwegian krone|1
Denmark|Copenhagen|Europe|Danish krone|1
Finland|Helsinki|Europe|Euro|2
Iceland|Reykjavik|Europe|Icelandic króna|2
Poland|Warsaw|Europe|Polish złoty|2
Czech Republic|Prague|Europe|Czech koruna|2
Hungary|Budapest|Europe|Hungarian forint|2
Romania|Bucharest|Europe|Romanian leu|2
Bulgaria|Sofia|Europe||3
Croatia|Zagreb|Europe||2
Serbia|Belgrade|Europe|Serbian dinar|3
Ukraine|Kyiv|Europe|Ukrainian hryvnia|2
Russia|Moscow||Russian ruble|1
Turkey|Ankara||Turkish lira|2
Estonia|Tallinn|Europe|Euro|3
Latvia|Riga|Europe|Euro|3
Lithuania|Vilnius|Europe|Euro|3
Slovakia|Bratislava|Europe|Euro|3
Slovenia|Ljubljana|Europe|Euro|3
Malta|Valletta|Europe|Euro|3
Albania|Tirana|Europe|Albanian lek|3
Belarus|Minsk|Europe|Belarusian ruble|3
Moldova|Chișinău|Europe|Moldovan leu|3
Bosnia and Herzegovina|Sarajevo|Europe|Convertible mark|3
North Macedonia|Skopje|Europe|Macedonian denar|3
Montenegro|Podgorica|Europe|Euro|3
Japan|Tokyo|Asia|Japanese yen|1
China|Beijing|Asia|Renminbi (yuan)|1
India|New Delhi|Asia|Indian rupee|1
South Korea|Seoul|Asia|South Korean won|1
North Korea|Pyongyang|Asia|North Korean won|2
Indonesia||Asia|Indonesian rupiah|2
Thailand|Bangkok|Asia|Thai baht|1
Vietnam|Hanoi|Asia|Vietnamese đồng|2
Philippines|Manila|Asia|Philippine peso|2
Malaysia|Kuala Lumpur|Asia|Malaysian ringgit|2
Pakistan|Islamabad|Asia|Pakistani rupee|2
Bangladesh|Dhaka|Asia|Bangladeshi taka|2
Sri Lanka||Asia|Sri Lankan rupee|2
Nepal|Kathmandu|Asia|Nepalese rupee|2
Bhutan|Thimphu|Asia|Bhutanese ngultrum|3
Afghanistan|Kabul|Asia|Afghan afghani|2
Iran|Tehran|Asia|Iranian rial|2
Iraq|Baghdad|Asia|Iraqi dinar|2
Saudi Arabia|Riyadh|Asia|Saudi riyal|1
United Arab Emirates|Abu Dhabi|Asia|UAE dirham|2
Qatar|Doha|Asia|Qatari riyal|2
Jordan|Amman|Asia|Jordanian dinar|3
Lebanon|Beirut|Asia|Lebanese pound|3
Syria|Damascus|Asia|Syrian pound|3
Oman|Muscat|Asia|Omani rial|3
Mongolia|Ulaanbaatar|Asia|Mongolian tögrög|2
Kazakhstan||Asia|Kazakhstani tenge|3
Uzbekistan|Tashkent|Asia|Uzbekistani som|3
Myanmar|Naypyidaw|Asia|Burmese kyat|3
Cambodia|Phnom Penh|Asia|Cambodian riel|3
Laos|Vientiane|Asia|Lao kip|3
Maldives|Malé|Asia|Maldivian rufiyaa|3
Armenia|Yerevan||Armenian dram|3
Georgia|Tbilisi||Georgian lari|3
Azerbaijan|Baku||Azerbaijani manat|3
Egypt|Cairo|Africa|Egyptian pound|1
South Africa||Africa|South African rand|1
Nigeria|Abuja|Africa|Nigerian naira|2
Kenya|Nairobi|Africa|Kenyan shilling|1
Ethiopia|Addis Ababa|Africa|Ethiopian birr|2
Ghana|Accra|Africa|Ghanaian cedi|2
Morocco|Rabat|Africa|Moroccan dirham|2
Algeria|Algiers|Africa|Algerian dinar|3
Tunisia|Tunis|Africa|Tunisian dinar|3
Libya|Tripoli|Africa|Libyan dinar|3
Senegal|Dakar|Africa||2
Tanzania|Dodoma|Africa|Tanzanian shilling|3
Uganda|Kampala|Africa|Ugandan shilling|2
Rwanda|Kigali|Africa|Rwandan franc|3
Zimbabwe|Harare|Africa||2
Zambia|Lusaka|Africa|Zambian kwacha|3
Angola|Luanda|Africa|Angolan kwanza|3
Mozambique|Maputo|Africa|Mozambican metical|3
Madagascar|Antananarivo|Africa|Malagasy ariary|3
Cameroon|Yaoundé|Africa||3
Namibia|Windhoek|Africa|Namibian dollar|3
Botswana|Gaborone|Africa|Botswana pula|3
Mali|Bamako|Africa||3
DR Congo|Kinshasa|Africa|Congolese franc|3
Somalia|Mogadishu|Africa||3
United States|Washington, D.C.|North America|US dollar|1
Canada|Ottawa|North America|Canadian dollar|1
Mexico|Mexico City|North America|Mexican peso|1
Cuba|Havana|North America|Cuban peso|2
Jamaica|Kingston|North America|Jamaican dollar|2
Costa Rica|San José|North America|Costa Rican colón|3
Honduras|Tegucigalpa|North America|Honduran lempira|3
Nicaragua|Managua|North America|Nicaraguan córdoba|3
Haiti|Port-au-Prince|North America|Haitian gourde|3
Dominican Republic|Santo Domingo|North America|Dominican peso|3
Bahamas|Nassau|North America|Bahamian dollar|3
El Salvador|San Salvador|North America||3
Trinidad and Tobago|Port of Spain|North America|Trinidad and Tobago dollar|3
Brazil|Brasília|South America|Brazilian real|1
Argentina|Buenos Aires|South America|Argentine peso|1
Chile|Santiago|South America|Chilean peso|2
Peru|Lima|South America|Peruvian sol|2
Colombia|Bogotá|South America|Colombian peso|2
Venezuela|Caracas|South America||2
Ecuador|Quito|South America||2
Bolivia||South America|Bolivian boliviano|3
Paraguay|Asunción|South America|Paraguayan guaraní|3
Uruguay|Montevideo|South America|Uruguayan peso|2
Guyana|Georgetown|South America|Guyanese dollar|3
Suriname|Paramaribo|South America|Surinamese dollar|3
Australia|Canberra|Oceania|Australian dollar|1
New Zealand|Wellington|Oceania|New Zealand dollar|1
Fiji|Suva|Oceania|Fijian dollar|3
Papua New Guinea|Port Moresby|Oceania|Papua New Guinean kina|3
Samoa|Apia|Oceania|Samoan tālā|3
Tonga|Nukuʻalofa|Oceania|Tongan paʻanga|3
`;

// country | main official language | tier   (multi-official-language countries left out)
const LANGUAGES = `
Brazil|Portuguese|1
Mexico|Spanish|1
Argentina|Spanish|1
Egypt|Arabic|1
Iran|Persian|2
Japan|Japanese|1
Austria|German|1
Netherlands|Dutch|1
Poland|Polish|1
Greece|Greek|1
Portugal|Portuguese|1
Angola|Portuguese|2
Mozambique|Portuguese|3
Chile|Spanish|1
Sweden|Swedish|1
Norway|Norwegian|1
Hungary|Hungarian|2
Turkey|Turkish|1
Vietnam|Vietnamese|1
Thailand|Thai|1
South Korea|Korean|1
Ethiopia|Amharic|3
Bangladesh|Bengali|2
Saudi Arabia|Arabic|1
Russia|Russian|1
Ukraine|Ukrainian|2
Czech Republic|Czech|2
Denmark|Danish|1
Iceland|Icelandic|2
Indonesia|Indonesian|2
Malaysia|Malay|2
Mongolia|Mongolian|2
Cambodia|Khmer|3
Laos|Lao|3
Nepal|Nepali|2
Italy|Italian|1
France|French|1
Germany|German|1
Cuba|Spanish|1
Colombia|Spanish|1
Romania|Romanian|2
Bulgaria|Bulgarian|2
Serbia|Serbian|2
Croatia|Croatian|2
Albania|Albanian|3
Lithuania|Lithuanian|3
Latvia|Latvian|3
Estonia|Estonian|3
Georgia|Georgian|3
Armenia|Armenian|3
`;

// symbol | name | atomic number | tier
const ELEMENTS = `
H|Hydrogen|1|1
He|Helium|2|1
Li|Lithium|3|2
Be|Beryllium|4|3
B|Boron|5|2
C|Carbon|6|1
N|Nitrogen|7|1
O|Oxygen|8|1
F|Fluorine|9|2
Ne|Neon|10|1
Na|Sodium|11|1
Mg|Magnesium|12|2
Al|Aluminium|13|2
Si|Silicon|14|2
P|Phosphorus|15|2
S|Sulfur|16|2
Cl|Chlorine|17|2
Ar|Argon|18|2
K|Potassium|19|1
Ca|Calcium|20|2
Ti|Titanium|22|3
Cr|Chromium|24|3
Mn|Manganese|25|3
Fe|Iron|26|1
Co|Cobalt|27|3
Ni|Nickel|28|2
Cu|Copper|29|1
Zn|Zinc|30|2
Ga|Gallium|31|3
Ge|Germanium|32|3
As|Arsenic|33|3
Se|Selenium|34|3
Br|Bromine|35|3
Kr|Krypton|36|3
Rb|Rubidium|37|3
Sr|Strontium|38|3
Zr|Zirconium|40|3
Pd|Palladium|46|3
Ag|Silver|47|1
Cd|Cadmium|48|3
Sn|Tin|50|2
Sb|Antimony|51|3
I|Iodine|53|2
Xe|Xenon|54|3
Cs|Caesium|55|3
Ba|Barium|56|3
W|Tungsten|74|3
Pt|Platinum|78|2
Au|Gold|79|1
Hg|Mercury|80|1
Pb|Lead|82|1
Bi|Bismuth|83|3
Rn|Radon|86|3
Ra|Radium|88|3
U|Uranium|92|2
Pu|Plutonium|94|3
`;

// title | author | tier
const BOOKS = `
Romeo and Juliet|William Shakespeare|1
Hamlet|William Shakespeare|1
Macbeth|William Shakespeare|1
Pride and Prejudice|Jane Austen|1
Sense and Sensibility|Jane Austen|2
Emma|Jane Austen|2
Oliver Twist|Charles Dickens|1
A Tale of Two Cities|Charles Dickens|2
Great Expectations|Charles Dickens|2
David Copperfield|Charles Dickens|2
Nineteen Eighty-Four|George Orwell|1
Animal Farm|George Orwell|1
The Adventures of Tom Sawyer|Mark Twain|1
Adventures of Huckleberry Finn|Mark Twain|2
War and Peace|Leo Tolstoy|2
Anna Karenina|Leo Tolstoy|2
Crime and Punishment|Fyodor Dostoevsky|2
The Brothers Karamazov|Fyodor Dostoevsky|3
Don Quixote|Miguel de Cervantes|2
Les Misérables|Victor Hugo|2
The Hunchback of Notre-Dame|Victor Hugo|2
The Three Musketeers|Alexandre Dumas|2
The Count of Monte Cristo|Alexandre Dumas|2
Twenty Thousand Leagues Under the Seas|Jules Verne|2
Around the World in Eighty Days|Jules Verne|1
Frankenstein|Mary Shelley|1
Dracula|Bram Stoker|1
The Picture of Dorian Gray|Oscar Wilde|2
Jane Eyre|Charlotte Brontë|2
Wuthering Heights|Emily Brontë|2
Moby-Dick|Herman Melville|2
The Great Gatsby|F. Scott Fitzgerald|1
To Kill a Mockingbird|Harper Lee|1
The Catcher in the Rye|J. D. Salinger|2
The Old Man and the Sea|Ernest Hemingway|2
A Farewell to Arms|Ernest Hemingway|3
Of Mice and Men|John Steinbeck|2
The Grapes of Wrath|John Steinbeck|2
One Hundred Years of Solitude|Gabriel García Márquez|2
Love in the Time of Cholera|Gabriel García Márquez|3
The Hobbit|J. R. R. Tolkien|1
The Lord of the Rings|J. R. R. Tolkien|1
Harry Potter and the Philosopher's Stone|J. K. Rowling|1
The Chronicles of Narnia|C. S. Lewis|1
Alice's Adventures in Wonderland|Lewis Carroll|1
Treasure Island|Robert Louis Stevenson|1
Strange Case of Dr Jekyll and Mr Hyde|Robert Louis Stevenson|2
The Jungle Book|Rudyard Kipling|1
Gulliver's Travels|Jonathan Swift|2
Robinson Crusoe|Daniel Defoe|2
The Little Prince|Antoine de Saint-Exupéry|1
Charlie and the Chocolate Factory|Roald Dahl|1
Matilda|Roald Dahl|1
The BFG|Roald Dahl|2
Brave New World|Aldous Huxley|2
Fahrenheit 451|Ray Bradbury|2
The Hitchhiker's Guide to the Galaxy|Douglas Adams|2
Dune|Frank Herbert|2
The Diary of a Young Girl|Anne Frank|1
The Alchemist|Paulo Coelho|1
Things Fall Apart|Chinua Achebe|2
The Kite Runner|Khaled Hosseini|2
Life of Pi|Yann Martel|2
The Da Vinci Code|Dan Brown|1
Murder on the Orient Express|Agatha Christie|1
The Hound of the Baskervilles|Arthur Conan Doyle|1
The Time Machine|H. G. Wells|2
The War of the Worlds|H. G. Wells|2
Little Women|Louisa May Alcott|2
Heidi|Johanna Spyri|2
Pinocchio|Carlo Collodi|2
The Odyssey|Homer|1
The Iliad|Homer|2
The Divine Comedy|Dante Alighieri|2
The Art of War|Sun Tzu|2
The Metamorphosis|Franz Kafka|2
Madame Bovary|Gustave Flaubert|3
The Canterbury Tales|Geoffrey Chaucer|3
Paradise Lost|John Milton|3
Ulysses|James Joyce|3
Mrs Dalloway|Virginia Woolf|3
Beloved|Toni Morrison|3
The Handmaid's Tale|Margaret Atwood|2
The Name of the Rose|Umberto Eco|3
The Tale of Peter Rabbit|Beatrix Potter|1
Winnie-the-Pooh|A. A. Milne|1
Peter Pan|J. M. Barrie|1
Anne of Green Gables|L. M. Montgomery|2
The Wind in the Willows|Kenneth Grahame|2
Black Beauty|Anna Sewell|2
The Hunger Games|Suzanne Collins|1
Norwegian Wood|Haruki Murakami|2
The Tale of Genji|Murasaki Shikibu|3
Gitanjali|Rabindranath Tagore|2
`;

// work | artist | tier
const ARTWORKS = `
Mona Lisa|Leonardo da Vinci|1
The Last Supper|Leonardo da Vinci|1
The Starry Night|Vincent van Gogh|1
Sunflowers|Vincent van Gogh|1
The Scream|Edvard Munch|1
Girl with a Pearl Earring|Johannes Vermeer|2
The Persistence of Memory|Salvador Dalí|1
Guernica|Pablo Picasso|1
The Birth of Venus|Sandro Botticelli|2
The Creation of Adam|Michelangelo|1
David (marble statue)|Michelangelo|1
The Thinker (sculpture)|Auguste Rodin|2
Water Lilies|Claude Monet|1
Impression, Sunrise|Claude Monet|2
The Night Watch|Rembrandt|2
The Kiss (gold painting)|Gustav Klimt|2
American Gothic|Grant Wood|2
The Great Wave off Kanagawa|Hokusai|2
Campbell's Soup Cans|Andy Warhol|1
The Son of Man|René Magritte|2
Las Meninas|Diego Velázquez|3
The Garden of Earthly Delights|Hieronymus Bosch|3
Liberty Leading the People|Eugène Delacroix|3
Luncheon of the Boating Party|Pierre-Auguste Renoir|3
A Sunday Afternoon on the Island of La Grande Jatte|Georges Seurat|3
Nighthawks|Edward Hopper|2
The Two Fridas|Frida Kahlo|2
Composition with Red, Blue and Yellow|Piet Mondrian|2
The School of Athens|Raphael|2
The Arnolfini Portrait|Jan van Eyck|3
Whistler's Mother|James McNeill Whistler|3
The Hay Wain|John Constable|3
The Fighting Temeraire|J. M. W. Turner|3
Wanderer above the Sea of Fog|Caspar David Friedrich|3
The Card Players|Paul Cézanne|3
Olympia|Édouard Manet|3
The Dance (1910)|Henri Matisse|3
Balloon Dog|Jeff Koons|3
`;

// invention | inventor | tier
const INVENTIONS = `
the telephone|Alexander Graham Bell|1
the light bulb (practical incandescent)|Thomas Edison|1
the World Wide Web|Tim Berners-Lee|1
the printing press with movable type (in Europe)|Johannes Gutenberg|1
the first successful powered aeroplane|The Wright brothers|1
the theory of relativity|Albert Einstein|1
the laws of motion and universal gravitation|Isaac Newton|1
the theory of evolution by natural selection|Charles Darwin|1
penicillin (discovery)|Alexander Fleming|1
the polio vaccine (first effective one)|Jonas Salk|2
the smallpox vaccine|Edward Jenner|2
radioactivity research and polonium|Marie Curie|1
the dynamite|Alfred Nobel|2
the alternating current induction motor|Nikola Tesla|2
the radio (long-distance wireless telegraphy)|Guglielmo Marconi|2
the steam engine improvements (separate condenser)|James Watt|2
the telescope improvements to study Jupiter's moons|Galileo Galilei|2
the periodic table|Dmitri Mendeleev|2
pasteurisation|Louis Pasteur|1
the phonograph|Thomas Edison|2
the television (first working mechanical system)|John Logie Baird|3
the electric battery (voltaic pile)|Alessandro Volta|2
the mercury thermometer|Daniel Gabriel Fahrenheit|3
the analytical engine design|Charles Babbage|2
the first computer program (for the analytical engine)|Ada Lovelace|2
the Turing machine concept|Alan Turing|2
the rabies vaccine|Louis Pasteur|3
the three laws of planetary motion|Johannes Kepler|3
the heliocentric model (Renaissance)|Nicolaus Copernicus|2
the laws of inheritance (pea plant experiments)|Gregor Mendel|2
the discovery of X-rays|Wilhelm Röntgen|3
the structure of DNA (1953 model)|James Watson and Francis Crick|2
the safety elevator brake|Elisha Otis|3
the Braille reading system|Louis Braille|2
the jet engine (British turbojet)|Frank Whittle|3
the diesel engine|Rudolf Diesel|2
the Morse code|Samuel Morse|2
the cotton gin|Eli Whitney|3
the first practical hot-air balloon flight|The Montgolfier brothers|3
the Richter scale|Charles Richter|3
the Celsius temperature scale|Anders Celsius|2
the Kelvin temperature scale|Lord Kelvin|3
the first successful human heart transplant|Christiaan Barnard|3
the lightning rod|Benjamin Franklin|2
`;

// film | director | tier   (classic, well-established credits)
const FILMS = `
Jaws|Steven Spielberg|1
E.T. the Extra-Terrestrial|Steven Spielberg|1
Jurassic Park|Steven Spielberg|1
Schindler's List|Steven Spielberg|2
Titanic|James Cameron|1
Avatar|James Cameron|1
The Terminator|James Cameron|2
Psycho|Alfred Hitchcock|1
Vertigo|Alfred Hitchcock|2
Rear Window|Alfred Hitchcock|2
The Godfather|Francis Ford Coppola|1
Apocalypse Now|Francis Ford Coppola|2
Pulp Fiction|Quentin Tarantino|1
Kill Bill: Volume 1|Quentin Tarantino|2
Inception|Christopher Nolan|1
The Dark Knight|Christopher Nolan|1
Interstellar|Christopher Nolan|1
Oppenheimer|Christopher Nolan|2
The Lord of the Rings: The Fellowship of the Ring|Peter Jackson|1
Star Wars (1977)|George Lucas|1
2001: A Space Odyssey|Stanley Kubrick|2
The Shining|Stanley Kubrick|2
A Clockwork Orange|Stanley Kubrick|3
Taxi Driver|Martin Scorsese|2
Goodfellas|Martin Scorsese|2
The Wolf of Wall Street|Martin Scorsese|2
Alien|Ridley Scott|2
Gladiator|Ridley Scott|1
Blade Runner|Ridley Scott|2
Forrest Gump|Robert Zemeckis|1
Back to the Future|Robert Zemeckis|1
Spirited Away|Hayao Miyazaki|1
My Neighbor Totoro|Hayao Miyazaki|2
Seven Samurai|Akira Kurosawa|2
Rashomon|Akira Kurosawa|3
Parasite|Bong Joon-ho|1
Pan's Labyrinth|Guillermo del Toro|2
The Shape of Water|Guillermo del Toro|2
Citizen Kane|Orson Welles|2
Casablanca|Michael Curtiz|3
Lawrence of Arabia|David Lean|3
The Matrix|The Wachowskis|1
Fight Club|David Fincher|2
The Social Network|David Fincher|2
Life of Pi|Ang Lee|2
Crouching Tiger, Hidden Dragon|Ang Lee|2
Slumdog Millionaire|Danny Boyle|2
Amélie|Jean-Pierre Jeunet|3
Pather Panchali|Satyajit Ray|3
Mad Max: Fury Road|George Miller|2
Gravity|Alfonso Cuarón|2
Roma|Alfonso Cuarón|3
Get Out|Jordan Peele|2
La La Land|Damien Chazelle|2
Whiplash|Damien Chazelle|2
The Grand Budapest Hotel|Wes Anderson|2
Lost in Translation|Sofia Coppola|3
Barbie (2023)|Greta Gerwig|2
Little Women (2019)|Greta Gerwig|3
Modern Times|Charlie Chaplin|2
The Great Dictator|Charlie Chaplin|2
`;

// character | film or series | tier
const CHARACTERS = `
Frodo Baggins|The Lord of the Rings|1
Gandalf|The Lord of the Rings|1
Hermione Granger|Harry Potter|1
Albus Dumbledore|Harry Potter|1
Luke Skywalker|Star Wars|1
Darth Vader|Star Wars|1
Yoda|Star Wars|1
Jack Sparrow|Pirates of the Caribbean|1
Woody|Toy Story|1
Buzz Lightyear|Toy Story|1
Simba|The Lion King|1
Elsa|Frozen|1
Shrek|Shrek|1
Nemo|Finding Nemo|1
Dory|Finding Nemo|1
Katniss Everdeen|The Hunger Games|1
Indiana Jones|Indiana Jones|1
James Bond|James Bond (007)|1
Marty McFly|Back to the Future|1
Neo|The Matrix|1
Ellen Ripley|Alien|2
Hannibal Lecter|The Silence of the Lambs|2
Vito Corleone|The Godfather|2
Forrest Gump|Forrest Gump|1
Rocky Balboa|Rocky|1
Dorothy Gale|The Wizard of Oz|1
Mary Poppins|Mary Poppins|1
Captain Jack Aubrey|Master and Commander|3
Chihiro|Spirited Away|2
Totoro|My Neighbor Totoro|2
Sheldon Cooper|The Big Bang Theory|1
Walter White|Breaking Bad|2
Eleven|Stranger Things|1
Jon Snow|Game of Thrones|2
Homer Simpson|The Simpsons|1
SpongeBob SquarePants|SpongeBob SquarePants|1
Ross Geller|Friends|1
Michael Scott|The Office (US)|2
Sherlock Holmes (Benedict Cumberbatch)|Sherlock|2
Wednesday Addams|The Addams Family|1
Moana|Moana|1
Miguel Rivera|Coco|2
Carl Fredricksen|Up|2
WALL-E|WALL-E|1
Remy the rat|Ratatouille|1
Po the panda|Kung Fu Panda|1
Hiccup|How to Train Your Dragon|2
Mr. Incredible|The Incredibles|1
Lightning McQueen|Cars|1
Groot|Guardians of the Galaxy|1
`;

// artist or band | country of origin | tier
const BANDS = `
The Beatles|United Kingdom|1
The Rolling Stones|United Kingdom|1
Queen|United Kingdom|1
Pink Floyd|United Kingdom|2
Led Zeppelin|United Kingdom|2
Coldplay|United Kingdom|1
Oasis|United Kingdom|2
Radiohead|United Kingdom|2
Adele|United Kingdom|1
Ed Sheeran|United Kingdom|1
ABBA|Sweden|1
Roxette|Sweden|3
BTS|South Korea|1
Blackpink|South Korea|1
U2|Ireland|1
The Cranberries|Ireland|2
AC/DC|Australia|1
INXS|Australia|3
Kylie Minogue|Australia|2
Nirvana|United States|2
Metallica|United States|2
Elvis Presley|United States|1
Michael Jackson|United States|1
Beyoncé|United States|1
Taylor Swift|United States|1
Bob Marley|Jamaica|1
Shakira|Colombia|1
Celine Dion|Canada|1
Drake|Canada|2
Justin Bieber|Canada|1
Rammstein|Germany|2
Kraftwerk|Germany|3
Daft Punk|France|2
Édith Piaf|France|2
a-ha|Norway|2
Björk|Iceland|2
Fela Kuti|Nigeria|3
Burna Boy|Nigeria|2
Bad Bunny|Puerto Rico|2
Gipsy Kings|France|3
`;

// instrument | family | tier    (families: String, Woodwind, Brass, Percussion, Keyboard)
const INSTRUMENTS = `
Violin|String|1
Viola|String|2
Cello|String|1
Double bass|String|2
Harp|String|1
Guitar|String|1
Sitar|String|2
Banjo|String|2
Ukulele|String|1
Mandolin|String|2
Flute|Woodwind|1
Clarinet|Woodwind|1
Oboe|Woodwind|2
Bassoon|Woodwind|2
Saxophone|Woodwind|2
Piccolo|Woodwind|2
Recorder|Woodwind|1
Trumpet|Brass|1
Trombone|Brass|1
French horn|Brass|2
Tuba|Brass|1
Cornet|Brass|3
Euphonium|Brass|3
Bugle|Brass|2
Snare drum|Percussion|1
Timpani|Percussion|2
Xylophone|Percussion|1
Cymbals|Percussion|1
Triangle|Percussion|1
Tabla|Percussion|2
Djembe|Percussion|2
Marimba|Percussion|2
Castanets|Percussion|2
Tambourine|Percussion|1
Piano|Keyboard|1
Harpsichord|Keyboard|2
Pipe organ|Keyboard|2
Accordion|Keyboard|3
Celesta|Keyboard|3
Synthesizer|Keyboard|2
`;

// composer | country | tier
const COMPOSERS = `
Wolfgang Amadeus Mozart|Austria|1
Ludwig van Beethoven|Germany|1
Johann Sebastian Bach|Germany|1
Frédéric Chopin|Poland|2
Pyotr Ilyich Tchaikovsky|Russia|1
Antonio Vivaldi|Italy|1
Giuseppe Verdi|Italy|2
Giacomo Puccini|Italy|2
Claude Debussy|France|2
Maurice Ravel|France|3
Johannes Brahms|Germany|2
Franz Schubert|Austria|2
Joseph Haydn|Austria|2
Antonín Dvořák|Czech Republic|3
Edvard Grieg|Norway|3
Jean Sibelius|Finland|3
George Frideric Handel|Germany|2
Richard Wagner|Germany|2
Sergei Rachmaninoff|Russia|3
Edward Elgar|United Kingdom|3
`;

// landmark | country | tier
const LANDMARKS = `
Eiffel Tower|France|1
Louvre Museum|France|1
Mont-Saint-Michel|France|2
Colosseum|Italy|1
Leaning Tower of Pisa|Italy|1
Trevi Fountain|Italy|2
Sagrada Família|Spain|1
Alhambra|Spain|2
Big Ben|United Kingdom|1
Stonehenge|United Kingdom|1
Tower Bridge|United Kingdom|1
Brandenburg Gate|Germany|1
Neuschwanstein Castle|Germany|2
Acropolis of Athens|Greece|1
Statue of Liberty|United States|1
Golden Gate Bridge|United States|1
Grand Canyon|United States|1
Mount Rushmore|United States|2
CN Tower|Canada|2
Niagara Falls (Horseshoe Falls)|Canada|2
Chichen Itza|Mexico|1
Christ the Redeemer|Brazil|1
Machu Picchu|Peru|1
Easter Island moai|Chile|2
Iguazu Falls (shared)|SKIP|2
Taj Mahal|India|1
Red Fort|India|2
Great Wall|China|1
Forbidden City|China|1
Terracotta Army|China|2
Mount Fuji|Japan|1
Fushimi Inari Shrine|Japan|2
Angkor Wat|Cambodia|1
Petronas Towers|Malaysia|1
Burj Khalifa|United Arab Emirates|1
Petra|Jordan|1
Pyramids of Giza|Egypt|1
Great Sphinx|Egypt|1
Abu Simbel temples|Egypt|2
Table Mountain|South Africa|2
Victoria Falls (shared)|SKIP|2
Kilimanjaro|Tanzania|1
Sydney Opera House|Australia|1
Uluru|Australia|1
Great Barrier Reef|Australia|1
Hobbiton film set|New Zealand|2
Saint Basil's Cathedral|Russia|1
Kremlin|Russia|1
Hagia Sophia|Turkey|1
Cappadocia rock landscape|Turkey|2
Charles Bridge|Czech Republic|2
Atomium|Belgium|2
Manneken Pis|Belgium|2
Little Mermaid statue|Denmark|2
Matterhorn (shared)|SKIP|2
Borobudur|Indonesia|2
Marina Bay Sands|Singapore|2
Shwedagon Pagoda|Myanmar|3
Blue Mosque (Sultan Ahmed Mosque)|Turkey|2
Sheikh Zayed Grand Mosque|United Arab Emirates|3
Moraine Lake|Canada|3
Cliffs of Moher|Ireland|2
Giant's Causeway|United Kingdom|2
Edinburgh Castle|United Kingdom|2
Rijksmuseum|Netherlands|2
Galápagos Islands|Ecuador|2
Salar de Uyuni salt flat|Bolivia|3
Perito Moreno Glacier|Argentina|3
Hallgrímskirkja church|Iceland|3
Wieliczka Salt Mine|Poland|3
Plitvice Lakes|Croatia|3
Meteora monasteries|Greece|3
Ha Long Bay|Vietnam|2
Banff National Park|Canada|3
Serengeti National Park|Tanzania|2
`;

// dish | country of origin | tier
const DISHES = `
Sushi|Japan|1
Ramen|Japan|1
Tempura|Japan|2
Paella|Spain|1
Gazpacho|Spain|2
Churros|Spain|2
Pizza Margherita|Italy|1
Risotto|Italy|1
Tiramisu|Italy|1
Lasagne|Italy|1
Croissant|France|1
Ratatouille|France|1
Crème brûlée|France|1
Coq au vin|France|2
Tacos|Mexico|1
Guacamole|Mexico|1
Enchiladas|Mexico|1
Mole poblano|Mexico|3
Kimchi|South Korea|1
Bibimbap|South Korea|1
Bulgogi|South Korea|2
Pad Thai|Thailand|1
Tom yum|Thailand|1
Green curry|Thailand|2
Pho|Vietnam|1
Bánh mì|Vietnam|2
Peking duck|China|1
Dim sum|China|1
Kung Pao chicken|China|2
Butter chicken|India|1
Biryani|India|1
Masala dosa|India|1
Samosa|India|1
Moussaka|Greece|2
Tzatziki|Greece|2
Baklava|Turkey|2
Kebab (döner)|Turkey|1
Borscht|Ukraine|2
Pierogi|Poland|2
Goulash|Hungary|2
Schnitzel (Wiener)|Austria|2
Sauerkraut|Germany|2
Bratwurst|Germany|1
Fish and chips|United Kingdom|1
Haggis|United Kingdom|2
Full English breakfast|United Kingdom|1
Poutine|Canada|2
Hamburger|United States|1
Clam chowder|United States|2
Feijoada|Brazil|2
Pão de queijo|Brazil|3
Ceviche|Peru|2
Empanadas (Argentine)|Argentina|2
Asado|Argentina|2
Arepa|Venezuela|3
Jollof rice|Nigeria|2
Tagine|Morocco|2
Couscous|Morocco|2
Injera|Ethiopia|2
Bobotie|South Africa|3
Hummus|Lebanon|2
Falafel|Egypt|3
Pavlova|New Zealand|3
Lamington|Australia|3
Vegemite on toast|Australia|2
Smørrebrød|Denmark|3
Swedish meatballs|Sweden|1
Fondue|Switzerland|1
Rösti|Switzerland|2
Stroopwafel|Netherlands|2
Waffles (Brussels)|Belgium|2
Jerk chicken|Jamaica|2
Nasi goreng|Indonesia|2
Laksa|Malaysia|3
Adobo|Philippines|2
Khachapuri|Georgia|3
Plov|Uzbekistan|3
`;

// animal | class | tier   (classes: Mammal, Bird, Reptile, Amphibian, Fish, Insect)
const ANIMALS = `
Dolphin|Mammal|1
Whale|Mammal|1
Bat|Mammal|1
Platypus|Mammal|2
Kangaroo|Mammal|1
Koala|Mammal|1
Elephant|Mammal|1
Giraffe|Mammal|1
Seal|Mammal|2
Walrus|Mammal|2
Hedgehog|Mammal|1
Otter|Mammal|1
Sloth|Mammal|1
Armadillo|Mammal|2
Pangolin|Mammal|2
Manatee|Mammal|2
Echidna|Mammal|3
Orca|Mammal|2
Hippopotamus|Mammal|1
Lemur|Mammal|2
Penguin|Bird|1
Ostrich|Bird|1
Emu|Bird|1
Kiwi|Bird|1
Flamingo|Bird|1
Owl|Bird|1
Pelican|Bird|1
Hummingbird|Bird|1
Albatross|Bird|2
Toucan|Bird|1
Puffin|Bird|2
Cassowary|Bird|3
Peacock|Bird|1
Kookaburra|Bird|2
Condor|Bird|2
Crocodile|Reptile|1
Alligator|Reptile|1
Turtle|Reptile|1
Tortoise|Reptile|1
Iguana|Reptile|1
Chameleon|Reptile|1
Komodo dragon|Reptile|1
Cobra|Reptile|1
Python|Reptile|1
Gecko|Reptile|1
Tuatara|Reptile|3
Gila monster|Reptile|3
Frog|Amphibian|1
Toad|Amphibian|1
Salamander|Amphibian|1
Newt|Amphibian|1
Axolotl|Amphibian|2
Caecilian|Amphibian|3
Shark|Fish|1
Seahorse|Fish|1
Salmon|Fish|1
Tuna|Fish|1
Clownfish|Fish|1
Eel|Fish|2
Stingray|Fish|2
Pufferfish|Fish|1
Swordfish|Fish|1
Piranha|Fish|1
Anglerfish|Fish|2
Catfish|Fish|1
Butterfly|Insect|1
Bee|Insect|1
Ant|Insect|1
Ladybird|Insect|1
Dragonfly|Insect|1
Grasshopper|Insect|1
Beetle|Insect|1
Mosquito|Insect|1
Termite|Insect|2
Praying mantis|Insect|1
Firefly|Insect|2
Cicada|Insect|2
Moth|Insect|1
Wasp|Insect|1
Cockroach|Insect|1
`;

// adult | baby name | tier
const BABY_ANIMALS = `
Kangaroo|Joey|1
Cat|Kitten|1
Dog|Puppy|1
Cow|Calf|1
Horse|Foal|1
Sheep|Lamb|1
Goat|Kid|2
Pig|Piglet|1
Duck|Duckling|1
Goose|Gosling|2
Swan|Cygnet|2
Owl|Owlet|2
Frog|Tadpole|1
Deer|Fawn|1
Bear|Cub|1
Lion|Cub|SKIP
Hare|Leveret|3
Eagle|Eaglet|2
Butterfly|Caterpillar|1
Seal|Pup|2
Rabbit|Kit|SKIP
Elephant|Calf|SKIP
Pigeon|Squab|3
Eel|Elver|3
Salmon|Fry|3
Turkey|Poult|3
Beaver|Kit|SKIP
`;

// animal | group name | tier
const ANIMAL_GROUPS = `
Lions|Pride|1
Wolves|Pack|1
Fish|School|1
Cows|Herd|1
Birds|Flock|1
Bees|Swarm|1
Crows|Murder|2
Owls|Parliament|2
Geese (on the ground)|Gaggle|2
Whales|Pod|2
Ants|Colony|1
Flamingos|Flamboyance|3
Zebras|Dazzle|3
Jellyfish|Smack|3
Kangaroos|Mob|3
Rhinos|Crash|3
Crocodiles|Bask|3
Puppies|Litter|1
Monkeys|Troop|2
Hyenas|Cackle|3
`;

// term or piece of equipment | sport | tier
const SPORT_TERMS = `
Slam dunk|Basketball|1
Three-pointer|Basketball|1
Touchdown (six points)|American football|1
Quarterback|American football|1
Home run|Baseball|1
Pitcher's mound|Baseball|2
Offside trap|Football (soccer)|2
Bogey|Golf|2
Scrum|Rugby|1
Try (grounding the ball)|Rugby|1
Wicket|Cricket|1
Leg before wicket|Cricket|2
Googly|Cricket|3
Shuttlecock|Badminton|1
Puck|Ice hockey|1
Checkmate|Chess|1
Castling|Chess|2
Strike (all ten pins)|Bowling|1
Spare (ten pins in two rolls)|Bowling|2
Butterfly stroke|Swimming|1
Freestyle relay|Swimming|2
Uppercut|Boxing|1
Knockout|Boxing|1
Épée|Fencing|2
Foil (light thrusting weapon)|Fencing|3
Peloton|Cycling|2
Yellow jersey (race leader)|Cycling|2
Dohyō (ring)|Sumo wrestling|3
Tatami mat and ippon|Judo|3
Bullseye|Darts|1
Oche (throw line)|Darts|3
Cue|Snooker|1
Pommel horse|Gymnastics|1
Balance beam|Gymnastics|1
Javelin|Athletics|1
Pole vault|Athletics|1
Hurdles|Athletics|1
Coxswain|Rowing|3
Slalom gates|Skiing|2
Stone and broom|Curling|2
Chukka|Polo|3
Raid|Kabaddi|2
Serve and spike|Volleyball|1
Libero|Volleyball|3
Maiden over|Cricket|3
Eagle (two under par)|Golf|2
Penalty corner|Field hockey|2
Bully-off|Field hockey|3
`;

// sport | players per team on the field | tier
const TEAM_SIZES = `
Football (soccer)|11|1
Basketball|5|1
Volleyball (indoor)|6|1
Cricket|11|1
Rugby union|15|2
Rugby league|13|3
Baseball|9|2
Ice hockey|6|2
Field hockey|11|2
Water polo|7|3
Netball|7|2
Handball|7|3
Beach volleyball|2|1
Kabaddi|7|3
Polo|4|3
American football|11|2
Australian rules football|18|3
Ultimate frisbee|7|3
`;

// year | host city (Summer Olympics) | tier
const OLYMPICS = `
1896|Athens|2
1936|Berlin|3
1948|London|3
1964|Tokyo|3
1968|Mexico City|3
1972|Munich|3
1976|Montreal|3
1980|Moscow|3
1984|Los Angeles|2
1988|Seoul|2
1992|Barcelona|2
1996|Atlanta|2
2000|Sydney|1
2004|Athens|2
2008|Beijing|1
2012|London|1
2016|Rio de Janeiro|1
2021 (held a year late)|Tokyo|1
2024|Paris|1
`;

// acronym | expansion | tier
const ACRONYMS = `
CPU|Central Processing Unit|1
GPU|Graphics Processing Unit|1
RAM|Random Access Memory|1
ROM|Read-Only Memory|2
USB|Universal Serial Bus|1
HTML|HyperText Markup Language|1
HTTP|Hypertext Transfer Protocol|1
URL|Uniform Resource Locator|1
PDF|Portable Document Format|1
GPS|Global Positioning System|1
Wi-Fi|Wireless Fidelity (marketing name)|SKIP
LED|Light-Emitting Diode|1
LCD|Liquid Crystal Display|2
SSD|Solid-State Drive|2
HDD|Hard Disk Drive|2
AI|Artificial Intelligence|1
VR|Virtual Reality|1
AR|Augmented Reality|1
IoT|Internet of Things|2
SMS|Short Message Service|1
PIN|Personal Identification Number|1
ATM|Automated Teller Machine|1
DNA|Deoxyribonucleic Acid|1
NASA|National Aeronautics and Space Administration|1
UNESCO|United Nations Educational, Scientific and Cultural Organization|2
WHO|World Health Organization|1
FIFA|Fédération Internationale de Football Association|2
UFO|Unidentified Flying Object|1
SIM|Subscriber Identity Module|2
JPEG|Joint Photographic Experts Group|3
GIF|Graphics Interchange Format|2
VPN|Virtual Private Network|2
ISP|Internet Service Provider|2
OS|Operating System|1
API|Application Programming Interface|2
CSS|Cascading Style Sheets|2
SQL|Structured Query Language|2
DVD|Digital Versatile Disc|2
MP3|MPEG Audio Layer III|3
CAPTCHA|Completely Automated Public Turing test to tell Computers and Humans Apart|3
LASER|Light Amplification by Stimulated Emission of Radiation|2
RADAR|Radio Detection and Ranging|2
SONAR|Sound Navigation and Ranging|2
SCUBA|Self-Contained Underwater Breathing Apparatus|2
ASAP|As Soon As Possible|1
FAQ|Frequently Asked Questions|1
CEO|Chief Executive Officer|1
IQ|Intelligence Quotient|1
BMI|Body Mass Index|2
UV|Ultraviolet|1
AM (radio)|Amplitude Modulation|3
FM (radio)|Frequency Modulation|2
NFC|Near-Field Communication|3
QR (code)|Quick Response|2
IP (address)|Internet Protocol|2
LAN|Local Area Network|2
WWW|World Wide Web|1
`;

// company | founder(s) | tier
const FOUNDERS = `
Microsoft|Bill Gates and Paul Allen|1
Apple|Steve Jobs, Steve Wozniak and Ronald Wayne|1
Facebook|Mark Zuckerberg and co-founders|1
Amazon|Jeff Bezos|1
Google|Larry Page and Sergey Brin|1
Tesla (early investor and CEO)|SKIP|3
SpaceX|Elon Musk|1
Alibaba|Jack Ma and co-founders|2
Ford Motor Company|Henry Ford|1
Disney|Walt Disney and Roy O. Disney|1
Nike|Phil Knight and Bill Bowerman|2
IKEA|Ingvar Kamprad|2
Honda|Soichiro Honda|2
Toyota Motor Corporation|Kiichiro Toyoda|3
Samsung|Lee Byung-chul|3
Sony|Masaru Ibuka and Akio Morita|3
Nintendo|Fusajiro Yamauchi|3
LEGO|Ole Kirk Christiansen|2
Adidas|Adolf Dassler|2
Puma|Rudolf Dassler|3
McDonald's (franchise giant)|Ray Kroc|SKIP
Wikipedia|Jimmy Wales and Larry Sanger|2
Twitter|Jack Dorsey and co-founders|2
Netflix|Reed Hastings and Marc Randolph|2
Airbnb|Brian Chesky, Joe Gebbia and Nathan Blecharczyk|3
Spotify|Daniel Ek and Martin Lorentzon|3
YouTube|Chad Hurley, Steve Chen and Jawed Karim|2
Instagram|Kevin Systrom and Mike Krieger|2
Oracle|Larry Ellison and co-founders|3
Dell|Michael Dell|2
`;

// company | home country | tier
const COMPANY_COUNTRY = `
Toyota|Japan|1
Sony|Japan|1
Nintendo|Japan|1
Samsung|South Korea|1
Hyundai|South Korea|1
LG|South Korea|2
Volkswagen|Germany|1
BMW|Germany|1
Siemens|Germany|2
Adidas|Germany|1
Nokia|Finland|1
IKEA|Sweden|1
Volvo|Sweden|2
Spotify|Sweden|2
LEGO|Denmark|1
Nestlé|Switzerland|1
Rolex|Switzerland|1
Ferrari|Italy|1
Fiat|Italy|2
Lamborghini|Italy|1
Renault|France|2
L'Oréal|France|2
Michelin|France|2
Philips|Netherlands|2
Heineken|Netherlands|2
Tata Group|India|2
Infosys|India|2
Alibaba|China|1
Huawei|China|1
Lenovo|China|2
Tencent|China|2
Rolls-Royce|United Kingdom|2
Coca-Cola|United States|1
Microsoft|United States|1
Boeing|United States|1
Red Bull|Austria|2
Nivea (Beiersdorf)|Germany|3
Havaianas|Brazil|3
`;

// word | synonym | tier
const SYNONYMS = `
Happy|Joyful|1
Big|Large|1
Fast|Quick|1
Begin|Start|1
Brave|Courageous|1
Tired|Exhausted|1
Angry|Furious|1
Smart|Intelligent|1
Beautiful|Gorgeous|1
Difficult|Challenging|1
Tiny|Minute|2
Ancient|Antique|2
Honest|Truthful|1
Rich|Wealthy|1
Funny|Humorous|1
Shy|Timid|2
Calm|Serene|2
Hungry|Famished|2
Scared|Frightened|1
Strange|Peculiar|2
Enormous|Gigantic|1
Quiet|Silent|1
Clever|Ingenious|2
Brief|Concise|2
Sad|Melancholy|2
Generous|Charitable|2
Lazy|Idle|2
Loyal|Faithful|2
Talkative|Loquacious|3
Hate|Loathe|2
Praise|Commend|2
Rare|Scarce|2
Stubborn|Obstinate|3
Obvious|Evident|2
Curious|Inquisitive|2
Mistake|Error|1
Gift|Present|1
Answer|Reply|1
Destroy|Demolish|2
Shine|Gleam|2
Ubiquitous|Omnipresent|3
Ephemeral|Fleeting|3
Benevolent|Kind-hearted|3
Candid|Frank|3
Meticulous|Thorough|3
Lucid|Clear|3
Tenacious|Persistent|3
Frugal|Thrifty|3
Gregarious|Sociable|3
Arduous|Strenuous|3
`;

// word | antonym | tier
const ANTONYMS = `
Hot|Cold|1
Up|Down|1
Early|Late|1
Ancient|Modern|1
Victory|Defeat|1
Generous|Stingy|2
Expand|Contract|2
Brave|Cowardly|1
Increase|Decrease|1
Accept|Reject|1
Rough|Smooth|1
Transparent|Opaque|2
Optimist|Pessimist|2
Friend|Enemy|1
Arrive|Depart|1
Maximum|Minimum|1
Visible|Invisible|1
Artificial|Natural|1
Shallow|Deep|1
Temporary|Permanent|1
Include|Exclude|1
Humble|Arrogant|2
Scarce|Abundant|2
Vertical|Horizontal|1
Import|Export|1
Ascend|Descend|2
Guilty|Innocent|1
Majority|Minority|1
Rigid|Flexible|2
Hero|Villain|1
Frequent|Rare|2
Simple|Complex|1
Private|Public|1
Asleep|Awake|1
Wealth|Poverty|2
Construct|Demolish|2
Praise|Criticise|2
Vague|Precise|2
Timid|Bold|2
Conceal|Reveal|2
Benevolent|Malevolent|3
Verbose|Concise|3
Novice|Expert|2
Zenith|Nadir|3
Ally|Adversary|2
Obscure|Famous|2
Hostile|Friendly|1
Drought|Flood|2
Mandatory|Optional|2
`;

// greeting word | language | tier
const HELLO = `
Bonjour|French|1
Hola|Spanish|1
Ciao|Italian|1
Hallo|German|SKIP
Konnichiwa|Japanese|1
Annyeonghaseyo|Korean|1
Nǐ hǎo|Mandarin Chinese|1
Namaste|Hindi|1
Olá|Portuguese|1
Merhaba|Turkish|2
Jambo|Swahili|2
Sawasdee|Thai|2
Shalom|Hebrew|2
Salaam|Arabic|SKIP
Zdravstvuyte|Russian|2
Hej|Swedish|2
Yassou|Greek|2
Aloha|Hawaiian|1
Kia ora|Māori|2
Xin chào|Vietnamese|2
Sawubona|Zulu|3
Dzień dobry|Polish|3
Goedendag|Dutch|3
`;

// irregular singular | plural | tier
const PLURALS = `
Mouse|Mice|1
Child|Children|1
Tooth|Teeth|1
Foot|Feet|1
Goose|Geese|1
Man|Men|1
Woman|Women|1
Ox|Oxen|2
Cactus|Cacti|2
Fungus|Fungi|2
Crisis|Crises|2
Phenomenon|Phenomena|2
Criterion|Criteria|3
Thesis|Theses|3
Leaf|Leaves|1
Knife|Knives|1
Wolf|Wolves|1
Datum|Data|3
Nucleus|Nuclei|3
Appendix (book)|Appendices|3
Bacterium|Bacteria|2
Medium (mass media)|Media|3
Louse|Lice|2
Die (dice cube)|Dice|2
`;

// event | year | tier
const EVENTS = `
The first human landed on the Moon (Apollo 11)|1969|1
The Berlin Wall fell|1989|1
World War I began|1914|1
World War II ended|1945|1
The Titanic sank|1912|1
Christopher Columbus first reached the Americas|1492|1
The French Revolution began (storming of the Bastille)|1789|2
The US Declaration of Independence was adopted|1776|1
The Magna Carta was sealed|1215|2
The Battle of Hastings was fought|1066|2
The first iPhone was released|2007|1
Yuri Gagarin became the first human in space|1961|2
The Wright brothers made their first powered flight|1903|2
India gained independence|1947|1
The Soviet Union dissolved|1991|2
Nelson Mandela was released from prison|1990|2
The Chernobyl nuclear accident happened|1986|2
The euro banknotes and coins entered circulation|2002|2
Martin Luther King Jr. gave his "I Have a Dream" speech|1963|2
The United Nations was founded|1945|2
The first modern Olympic Games were held|1896|2
The Great Fire of London broke out|1666|3
Gutenberg's printing press began printing the Bible (c.)|1455|3
The Wall Street Crash began|1929|2
The Black Death reached Europe (c.)|1347|3
The Suez Canal opened|1869|3
The Panama Canal opened|1914|3
The telephone was patented by Bell|1876|3
The first successful Mount Everest summit (Hillary and Norgay)|1953|2
The Hubble Space Telescope was launched|1990|3
Charles Darwin published On the Origin of Species|1859|3
Napoleon was defeated at the Battle of Waterloo|1815|2
The Russian Revolution (October Revolution) took place|1917|2
The first email was sent (Ray Tomlinson)|1971|3
The World Wide Web was proposed by Tim Berners-Lee|1989|3
Pompeii was buried by the eruption of Mount Vesuvius|79|3
The American Civil War ended|1865|2
Queen Victoria's reign began|1837|3
The first successful human heart transplant|1967|3
Dolly the sheep, the first cloned mammal, was born|1996|3
The International Space Station received its first resident crew|2000|3
The Treaty of Versailles was signed|1919|3
The Great Depression's stock market crash hit Wall Street|SKIP|3
The Boston Tea Party took place|1773|3
The Spanish Armada was defeated|1588|3
The first Harry Potter book was published|1997|2
The first FIFA World Cup was held|1930|2
Apartheid officially ended with South Africa's first all-race election|1994|2
The Human Genome Project was declared complete|2003|3
The Rosetta Stone was discovered|1799|3
`;

// scientist | best known for | tier
const SCIENTISTS = `
Isaac Newton|The law of universal gravitation|1
Albert Einstein|The theory of relativity|1
Charles Darwin|Evolution by natural selection|1
Marie Curie|Pioneering research on radioactivity|1
Galileo Galilei|Telescopic discovery of Jupiter's moons|2
Nicolaus Copernicus|The Sun-centred model of the solar system|2
Gregor Mendel|The laws of genetic inheritance|2
Louis Pasteur|Pasteurisation and germ theory|2
Alexander Fleming|The discovery of penicillin|1
Dmitri Mendeleev|The periodic table of elements|2
Stephen Hawking|Black hole radiation|1
Edwin Hubble|Evidence that the universe is expanding|2
Rosalind Franklin|X-ray images revealing DNA's structure|2
Michael Faraday|Electromagnetic induction|2
James Clerk Maxwell|The equations of electromagnetism|3
Niels Bohr|The model of the atom with electron shells|3
Ernest Rutherford|Discovering the atomic nucleus|3
Max Planck|The origin of quantum theory|3
Carl Linnaeus|The system for naming species|3
Alfred Wegener|The theory of continental drift|3
Jane Goodall|Long-term study of wild chimpanzees|2
Rachel Carson|Silent Spring and the environmental movement|3
Archimedes|The principle of buoyancy|2
Pythagoras|The theorem about right-angled triangles|1
Euclid|The foundations of geometry (Elements)|2
Hippocrates|The father of Western medicine|2
Srinivasa Ramanujan|Brilliant work in number theory and infinite series|3
Tim Berners-Lee|Inventing the World Wide Web|1
Alan Turing|The foundations of computer science|2
Katherine Johnson|Orbital calculations for NASA missions|3
`;

// river | continent | tier
const RIVERS = `
Nile|Africa|1
Amazon|South America|1
Mississippi|North America|1
Yangtze|Asia|1
Danube|Europe|1
Ganges|Asia|1
Thames|Europe|1
Congo|Africa|2
Mekong|Asia|2
Rhine|Europe|1
Volga|Europe|2
Murray|Oceania|2
Niger|Africa|2
Zambezi|Africa|2
Paraná|South America|3
Orinoco|South America|3
Yukon|North America|3
Rio Grande|North America|2
Seine|Europe|1
Tigris|Asia|2
Euphrates|Asia|2
Indus|Asia|2
Mackenzie|North America|3
Loire|Europe|2
Irrawaddy|Asia|3
Darling|Oceania|3
Limpopo|Africa|3
Colorado|North America|2
Elbe|Europe|3
Yellow River (Huang He)|Asia|2
`;

// historical figure | modern country most associated with them | tier
const FIGURES = `
Cleopatra|Egypt|1
Ramesses II|Egypt|2
Tutankhamun|Egypt|1
Napoleon Bonaparte|France|1
Joan of Arc|France|1
Winston Churchill|United Kingdom|1
Queen Victoria|United Kingdom|1
Florence Nightingale|United Kingdom|2
Abraham Lincoln|United States|1
Amelia Earhart|United States|2
Mahatma Gandhi|India|1
Ashoka the Great|India|2
Akbar|India|2
Nelson Mandela|South Africa|1
Genghis Khan|Mongolia|1
Confucius|China|1
Qin Shi Huang|China|2
Tokugawa Ieyasu|Japan|3
Catherine the Great|Russia|2
Peter the Great|Russia|2
Simón Bolívar|Venezuela|2
José de San Martín|Argentina|3
Hernán Cortés|Spain|2
Vasco da Gama|Portugal|2
Ferdinand Magellan|Portugal|2
Marco Polo|Italy|1
Leonardo da Vinci|Italy|1
Giuseppe Garibaldi|Italy|3
Otto von Bismarck|Germany|2
Mustafa Kemal Atatürk|Turkey|2
Kwame Nkrumah|Ghana|3
Jomo Kenyatta|Kenya|3
Haile Selassie|Ethiopia|3
Emiliano Zapata|Mexico|3
Frida Kahlo|Mexico|1
Montezuma II|Mexico|3
Pachacuti|Peru|3
Shaka Zulu|South Africa|3
Robert the Bruce|United Kingdom|3
Brian Boru|Ireland|3
`;

// athlete (retired legends and long-established stars) | sport | tier
const ATHLETES = `
Usain Bolt|Athletics|1
Carl Lewis|Athletics|2
Eliud Kipchoge|Athletics|2
Sergey Bubka|Athletics|3
Michael Phelps|Swimming|1
Mark Spitz|Swimming|3
Ian Thorpe|Swimming|2
Serena Williams|Tennis|1
Roger Federer|Tennis|1
Rafael Nadal|Tennis|1
Martina Navratilova|Tennis|2
Björn Borg|Tennis|2
Pelé|Football (soccer)|1
Diego Maradona|Football (soccer)|1
Lionel Messi|Football (soccer)|1
Mia Hamm|Football (soccer)|3
Muhammad Ali|Boxing|1
Manny Pacquiao|Boxing|2
Michael Jordan|Basketball|1
Kobe Bryant|Basketball|1
LeBron James|Basketball|1
Tiger Woods|Golf|1
Jack Nicklaus|Golf|2
Sachin Tendulkar|Cricket|1
Don Bradman|Cricket|2
Wayne Gretzky|Ice hockey|2
Nadia Comăneci|Gymnastics|2
Simone Biles|Gymnastics|1
Babe Ruth|Baseball|2
Ayrton Senna|Formula One|2
Michael Schumacher|Formula One|1
Lewis Hamilton|Formula One|1
Magnus Carlsen|Chess|1
Garry Kasparov|Chess|2
Jonah Lomu|Rugby union|3
Yuzuru Hanyu|Figure skating|3
Katarina Witt|Figure skating|3
Lindsey Vonn|Alpine skiing|2
Chris Hoy|Cycling|3
Eddy Merckx|Cycling|3
Lin Dan|Badminton|2
Ma Long|Table tennis|3
Tony Hawk|Skateboarding|1
Shaun White|Snowboarding|2
`;

// Roman numerals are generated (see quiz-bank.js).

module.exports = {
  COUNTRIES,
  LANGUAGES,
  ELEMENTS,
  BOOKS,
  ARTWORKS,
  INVENTIONS,
  FILMS,
  CHARACTERS,
  BANDS,
  INSTRUMENTS,
  COMPOSERS,
  LANDMARKS,
  DISHES,
  ANIMALS,
  BABY_ANIMALS,
  ANIMAL_GROUPS,
  SPORT_TERMS,
  TEAM_SIZES,
  OLYMPICS,
  ACRONYMS,
  FOUNDERS,
  COMPANY_COUNTRY,
  SYNONYMS,
  ANTONYMS,
  HELLO,
  PLURALS,
  EVENTS,
  SCIENTISTS,
  RIVERS,
  FIGURES,
  ATHLETES,
};
