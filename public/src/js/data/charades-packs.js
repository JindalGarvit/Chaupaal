/**
 * Charades title packs (Dangal G2, global-first pass P15). Teen-safe titles only; famous people are
 * historical or widely admired public figures (living-person-safe).
 * Row: 'English|हिंदी|difficulty[|alt1,alt2]' — difficulty e (easy) · m (medium) · h (hard).
 *   हिंदी is locale data ('' = none; the Hindi UI then shows English).
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
      hi: 'बॉलीवुड फ़िल्में',
      icon: '🎬',
      kind: 'movie',
      regional: true,
      rows: [
        'Sholay|शोले|e', 'Dilwale Dulhania Le Jayenge|दिलवाले दुल्हनिया ले जायेंगे|e|DDLJ', 'Kuch Kuch Hota Hai|कुछ कुछ होता है|e|KKHH',
        '3 Idiots|थ्री इडियट्स|e|three idiots', 'Lagaan|लगान|e', 'Dangal|दंगल|e', 'PK|पीके|e', 'Taare Zameen Par|तारे ज़मीन पर|e',
        'Kabhi Khushi Kabhie Gham|कभी ख़ुशी कभी ग़म|e|K3G,kabhi khushi kabhi gham', 'Chak De India|चक दे इंडिया|e', 'Mother India|मदर इंडिया|e',
        'Bajrangi Bhaijaan|बजरंगी भाईजान|e', 'Krrish|कृष|e|krish', 'Koi Mil Gaya|कोई मिल गया|e', 'Dhoom|धूम|e', 'Don|डॉन|e',
        'Hum Aapke Hain Koun|हम आपके हैं कौन|m', 'Munna Bhai MBBS|मुन्ना भाई एमबीबीएस|e', 'Lage Raho Munna Bhai|लगे रहो मुन्ना भाई|m',
        'Chennai Express|चेन्नई एक्सप्रेस|e', 'Om Shanti Om|ओम शांति ओम|e', 'Kal Ho Naa Ho|कल हो ना हो|e|kal ho na ho', 'Main Hoon Na|मैं हूँ ना|e',
        'Baahubali|बाहुबली|e|bahubali', 'RRR|आरआरआर|e', 'Pathaan|पठान|e|pathan', 'Jawan|जवान|e', 'Sultan|सुल्तान|e', 'Tiger Zinda Hai|टाइगर ज़िंदा है|e',
        'Ek Tha Tiger|एक था टाइगर|e', 'Dabangg|दबंग|e|dabang', 'Singham|सिंघम|e', 'Golmaal|गोलमाल|e', 'Hera Pheri|हेरा फेरी|e', 'Queen|क्वीन|e',
        'Andaz Apna Apna|अंदाज़ अपना अपना|m', 'Jab We Met|जब वी मेट|e', 'Zindagi Na Milegi Dobara|ज़िंदगी ना मिलेगी दोबारा|m|ZNMD',
        'Yeh Jawaani Hai Deewani|ये जवानी है दीवानी|m|yjhd', 'Dil Chahta Hai|दिल चाहता है|m', 'Rang De Basanti|रंग दे बसंती|m', 'Border|बॉर्डर|e',
        'Gadar|ग़दर|e', 'Kaho Naa Pyaar Hai|कहो ना प्यार है|e|kaho na pyar hai', 'Mohabbatein|मोहब्बतें|e', 'Devdas|देवदास|e', 'Padmaavat|पद्मावत|m|padmavat',
        'Bajirao Mastani|बाजीराव मस्तानी|m', 'Chhichhore|छिछोरे|m|chhichore', 'Stree|स्त्री|e', 'Bhool Bhulaiyaa|भूल भुलैया|e|bhool bhulaiya',
        'Andhadhun|अंधाधुन|m', 'Drishyam|दृश्यम|m', 'Kahaani|कहानी|m|kahani', 'Barfi|बर्फी|e', 'Swades|स्वदेस|m', 'Dil To Pagal Hai|दिल तो पागल है|e',
        'Jodhaa Akbar|जोधा अकबर|m|jodha akbar', 'Mughal-E-Azam|मुग़ल-ए-आज़म|m|mughal e azam', 'Gully Boy|गली बॉय|e', 'Uri|उरी|m', 'Shershaah|शेरशाह|m|shershah',
        '83|83|m|eighty three', 'Brahmastra|ब्रह्मास्त्र|m', 'Tanhaji|तान्हाजी|m', 'Laal Singh Chaddha|लाल सिंह चड्ढा|m',
        'Rocky Aur Rani Kii Prem Kahaani|रॉकी और रानी की प्रेम कहानी|h|rocky aur rani ki prem kahani', '12th Fail|ट्वेल्थ फ़ेल|m|twelfth fail',
        'Laapataa Ladies|लापता लेडीज़|m|lapata ladies', 'Dunki|डंकी|m', 'Stree 2|स्त्री 2|m', 'Fighter|फ़ाइटर|e', 'War|वॉर|e', 'Super 30|सुपर 30|m',
        'Kesari|केसरी|m', 'Mission Mangal|मिशन मंगल|m', 'Badhaai Ho|बधाई हो|m|badhai ho', 'Piku|पीकू|m', 'Hindi Medium|हिंदी मीडियम|m',
        'Bhaag Milkha Bhaag|भाग मिल्खा भाग|e', 'Mary Kom|मैरी कॉम|e', 'M.S. Dhoni: The Untold Story|एम.एस. धोनी: द अनटोल्ड स्टोरी|m|ms dhoni',
        'Raazi|राज़ी|m|raazi', 'Tumbbad|तुम्बाड|h|tumbad', 'The Lunchbox|द लंचबॉक्स|h|lunchbox', 'Udaan|उड़ान|h', 'Wake Up Sid|वेक अप सिड|m',
        'Rockstar|रॉकस्टार|e', 'Tamasha|तमाशा|m', 'Dil Dhadakne Do|दिल धड़कने दो|m', 'Kapoor & Sons|कपूर एंड संस|h|kapoor and sons',
        'English Vinglish|इंग्लिश विंग्लिश|m', 'Paa|पा|m', 'Black|ब्लैक|m', 'Fanaa|फ़ना|m|fana', 'Veer-Zaara|वीर-ज़ारा|m|veer zaara', 'Karan Arjun|करन अर्जुन|e',
        'Baazigar|बाज़ीगर|m|bazigar', 'Mr. India|मिस्टर इंडिया|e|mister india', 'Deewaar|दीवार|m|deewar', 'Zanjeer|ज़ंजीर|m', 'Anand|आनंद|m', 'Guide|गाइड|h',
        'Pakeezah|पाकीज़ा|h|pakeeza', 'Chupke Chupke|चुपके चुपके|h', 'Amar Akbar Anthony|अमर अकबर एंथनी|m', 'Namak Halaal|नमक हलाल|h|namak halal',
        'Coolie|कुली|m', 'Agneepath|अग्निपथ|m', 'Silsila|सिलसिला|h', 'Maine Pyar Kiya|मैंने प्यार किया|m', 'Qayamat Se Qayamat Tak|क़यामत से क़यामत तक|h|QSQT',
        'Hum Dil De Chuke Sanam|हम दिल दे चुके सनम|m', 'Dil Se|दिल से|m', 'Rangeela|रंगीला|m', 'Jo Jeeta Wohi Sikandar|जो जीता वही सिकंदर|h',
        'Jaane Tu Ya Jaane Na|जाने तू या जाने ना|m', 'Rab Ne Bana Di Jodi|रब ने बना दी जोड़ी|m', 'Ra.One|रा.वन|m|ra one', 'Airlift|एयरलिफ्ट|m',
        'Special 26|स्पेशल 26|h', 'A Wednesday|अ वेडनेसडे|h', 'Ghajini|गजनी|e', 'Fukrey|फुकरे|m', 'Welcome|वेलकम|e', 'Dhamaal|धमाल|e',
        'Housefull|हाउसफुल|e', 'Phir Hera Pheri|फिर हेरा फेरी|m', 'OMG: Oh My God|ओह माय गॉड|m|oh my god,omg', 'Dream Girl|ड्रीम गर्ल|e',
        'Tubelight|ट्यूबलाइट|m', 'Prem Ratan Dhan Payo|प्रेम रतन धन पायो|h', 'Hum Saath-Saath Hain|हम साथ-साथ हैं|m|hum saath saath hain',
        'Bodyguard|बॉडीगार्ड|e', 'Jolly LLB|जॉली एलएलबी|m', 'Kai Po Che|काई पो चे|h', 'Sanju|संजू|m', 'Pushpa|पुष्पा|e',
      ],
    },
    {
      id: 'songs',
      en: 'Bollywood Songs',
      hi: 'बॉलीवुड गाने',
      icon: '🎤',
      kind: 'song',
      regional: true,
      rows: [
        'Tujhe Dekha To|तुझे देखा तो|e', 'Chaiyya Chaiyya|छैय्या छैय्या|e|chaiya chaiya', 'Tum Hi Ho|तुम ही हो|e', 'Kesariya|केसरिया|e', 'Jai Ho|जय हो|e',
        'Mere Sapno Ki Rani|मेरे सपनों की रानी|m', 'Pal Pal Dil Ke Paas|पल पल दिल के पास|m', 'Lag Ja Gale|लग जा गले|m', 'Ek Do Teen|एक दो तीन|e',
        'Yeh Dosti|ये दोस्ती|e', 'Kajra Re|कजरा रे|m', 'Dhoom Machale|धूम मचाले|e', 'Balam Pichkari|बलम पिचकारी|m', 'Gallan Goodiyaan|गल्लां गुड़ियाँ|h',
        'London Thumakda|लंदन ठुमकदा|m', 'Nagada Sang Dhol|नगाड़ा संग ढोल|m', 'Malhari|मल्हारी|h', 'Ghoomar|घूमर|m', 'Badtameez Dil|बदतमीज़ दिल|m',
        'Senorita|सेनोरिटा|m', 'Naatu Naatu|नाटू नाटू|e|naacho naacho', 'Srivalli|श्रीवल्ली|m', 'Jhoome Jo Pathaan|झूमे जो पठान|m', 'Chaleya|चलेया|m',
        'Apna Bana Le|अपना बना ले|m', 'Raataan Lambiyan|रातां लम्बियां|m', 'Tera Ban Jaunga|तेरा बन जाऊँगा|m', 'Channa Mereya|चन्ना मेरेया|m',
        'Agar Tum Saath Ho|अगर तुम साथ हो|m', 'Tum Se Hi|तुम से ही|m', 'Kabira|कबीरा|m', 'Ilahi|इलाही|h', 'Kun Faya Kun|कुन फ़या कुन|h',
        'Chammak Challo|छम्मक छल्लो|e', 'Desi Girl|देसी गर्ल|e', 'Kala Chashma|काला चश्मा|e', 'Lungi Dance|लुंगी डांस|e', 'Mauja Hi Mauja|मौजा ही मौजा|m',
        'Aankh Marey|आँख मारे|m', 'Swag Se Swagat|स्वैग से स्वागत|m', 'Jag Ghoomeya|जग घूमेया|h', 'Gerua|गेरुआ|m', 'Janam Janam|जनम जनम|m',
        'Tum Tak|तुम तक|h', 'Kaun Tujhe|कौन तुझे|m', 'Dil Diyan Gallan|दिल दियां गल्लां|m', 'Mere Dholna|मेरे ढोलना|m', 'Suraj Hua Maddham|सूरज हुआ मद्धम|h',
        'Tujh Mein Rab Dikhta Hai|तुझ में रब दिखता है|m', 'Zoobi Doobi|ज़ूबी डूबी|m', 'Give Me Some Sunshine|गिव मी सम सनशाइन|m', 'All Izz Well|ऑल इज़ वेल|e|all is well',
        'Pappu Cant Dance|पप्पू कान्ट डांस|m|pappu can\'t dance', 'Chura Liya Hai Tumne|चुरा लिया है तुमने|h', 'Yeh Shaam Mastani|ये शाम मस्तानी|h',
        'Zindagi Ek Safar|ज़िंदगी एक सफ़र|h', 'Jimmy Jimmy|जिमी जिमी|e', 'I Am a Disco Dancer|आई एम अ डिस्को डांसर|e|disco dancer',
        'Didi Tera Devar Deewana|दीदी तेरा देवर दीवाना|m', 'Maahi Ve|माही वे|m', 'Saathiya|साथिया|m', 'Kuch Na Kaho|कुछ ना कहो|h',
        'Ruk Ja O Dil Deewane|रुक जा ओ दिल दीवाने|m', 'Hawayein|हवाएँ|m', 'Phir Bhi Tumko Chaahunga|फिर भी तुमको चाहूँगा|h', 'Ghungroo|घुंघरू|m',
        'Sadda Haq|सड्डा हक़|m', 'Abhi Mujh Mein Kahin|अभी मुझ में कहीं|h', 'Masakali|मसकली|m', 'Bum Bum Bole|बम बम बोले|m',
      ],
    },
    {
      id: 'hollywood',
      en: 'Movies',
      hi: 'फ़िल्में',
      icon: '🍿',
      kind: 'movie',
      rows: [
        'Titanic|टाइटैनिक|e', 'Avatar|अवतार|e', 'Jurassic Park|जुरासिक पार्क|e', 'The Lion King|द लायन किंग|e', 'Frozen|फ्रोज़न|e', 'Finding Nemo|फाइंडिंग नीमो|e',
        'Toy Story|टॉय स्टोरी|e', 'Harry Potter|हैरी पॉटर|e', 'Star Wars|स्टार वॉर्स|e', 'Spider-Man|स्पाइडर-मैन|e|spiderman', 'Iron Man|आयरन मैन|e',
        'The Avengers|द एवेंजर्स|e|avengers', 'Black Panther|ब्लैक पैंथर|m', 'The Dark Knight|द डार्क नाइट|m|batman', 'Superman|सुपरमैन|e',
        'Wonder Woman|वंडर वुमन|e', 'Shrek|श्रेक|e', 'Home Alone|होम अलोन|e', 'Jaws|जॉज़|m', 'E.T.|ई.टी.|m|et', 'Back to the Future|बैक टू द फ्यूचर|m',
        'Indiana Jones|इंडियाना जोन्स|m', 'The Wizard of Oz|द विज़र्ड ऑफ़ ओज़|m', 'Mary Poppins|मैरी पॉपिन्स|m', 'The Sound of Music|द साउंड ऑफ़ म्यूज़िक|h',
        'Up|अप|m', 'Inside Out|इनसाइड आउट|m', 'Coco|कोको|m', 'Moana|मोआना|e', 'Aladdin|अलादीन|e', 'Beauty and the Beast|ब्यूटी एंड द बीस्ट|e',
        'Cinderella|सिंड्रेला|e', 'Kung Fu Panda|कुंग फ़ू पांडा|e', 'Madagascar|मैडागास्कर|e', 'Ice Age|आइस एज|e', 'Minions|मिनियन्स|e',
        'Despicable Me|डेस्पिकेबल मी|m', 'Cars|कार्स|e', 'Ratatouille|रैटाटुई|h', 'WALL-E|वॉल-ई|m|wall e', 'Monsters, Inc.|मॉन्स्टर्स, इंक.|m|monsters inc',
        'The Incredibles|द इनक्रेडिबल्स|m', 'Zootopia|ज़ूटोपिया|m', 'Encanto|एनकैंटो|m', 'The Jungle Book|द जंगल बुक|e', 'Pirates of the Caribbean|पाइरेट्स ऑफ़ द कैरिबियन|m',
        'The Lord of the Rings|द लॉर्ड ऑफ़ द रिंग्स|m', 'The Hobbit|द हॉबिट|m', 'Transformers|ट्रांसफ़ॉर्मर्स|e', 'Men in Black|मेन इन ब्लैक|e',
        'Ghostbusters|घोस्टबस्टर्स|m', 'Mission: Impossible|मिशन: इम्पॉसिबल|e|mission impossible', 'Top Gun|टॉप गन|m', 'Forrest Gump|फ़ॉरेस्ट गंप|m',
        'Rocky|रॉकी|e', 'Jumanji|जुमांजी|e', 'Night at the Museum|नाइट एट द म्यूज़ियम|m', 'Barbie|बार्बी|e', 'Inception|इनसेप्शन|h', 'Interstellar|इंटरस्टेलर|h',
        'Gravity|ग्रैविटी|m', 'The Martian|द मार्शियन|h', 'Charlie and the Chocolate Factory|चार्ली एंड द चॉकलेट फ़ैक्ट्री|m', 'Matilda|मटिल्डा|m',
        'Paddington|पैडिंगटन|m', 'King Kong|किंग कॉन्ग|e', 'Godzilla|गॉडज़िला|e', 'Pinocchio|पिनोकियो|m', 'Mulan|मूलान|m', 'Tarzan|टार्ज़न|e',
        'The Little Mermaid|द लिटिल मरमेड|m', 'Tangled|टैंगल्ड|m', 'Big Hero 6|बिग हीरो 6|m',
      ],
    },
    {
      id: 'tv',
      en: 'TV Shows',
      hi: 'टीवी शो',
      icon: '📺',
      kind: 'tv',
      rows: [
        'Friends|फ्रेंड्स|e', 'The Office|द ऑफ़िस|m', 'Stranger Things|स्ट्रेंजर थिंग्स|m', 'Sherlock|शरलॉक|m', 'Doctor Who|डॉक्टर हू|h', 'Mr. Bean|मिस्टर बीन|e|mister bean',
        'The Simpsons|द सिम्पसन्स|m', 'SpongeBob SquarePants|स्पंजबॉब स्क्वेयरपैंट्स|e|spongebob', 'Tom and Jerry|टॉम एंड जेरी|e', 'Pokémon|पोकेमॉन|e|pokemon',
        'Doraemon|डोरेमोन|e', 'Shinchan|शिनचैन|e', 'Shark Tank|शार्क टैंक|m', 'MasterChef|मास्टरशेफ़|e',
        'Wednesday|वेन्सडे|m', 'The Crown|द क्राउन|h', 'Modern Family|मॉडर्न फ़ैमिली|m', 'The Big Bang Theory|द बिग बैंग थ्योरी|m',
        'Brooklyn Nine-Nine|ब्रुकलिन नाइन-नाइन|h|brooklyn 99', 'The Mandalorian|द मैंडलोरियन|h', 'Avatar: The Last Airbender|अवतार: द लास्ट एयरबेंडर|h|avatar last airbender',
        'Peppa Pig|पेप्पा पिग|e', 'Bluey|ब्लूई|m', 'Ben 10|बेन 10|e', 'Scooby-Doo|स्कूबी-डू|e|scooby doo',
        'Sesame Street||e', 'The Muppets||e|muppet show', 'Looney Tunes||e', 'Paw Patrol||e', 'The Flintstones||m', 'The Pink Panther||m|pink panther',
        'Teenage Mutant Ninja Turtles||m|ninja turtles', 'Power Rangers||e', 'Seinfeld||h', 'How I Met Your Mother||m', 'Survivor||m',
        'Who Wants to Be a Millionaire||m|millionaire', 'Wheel of Fortune||m', 'Top Gear||m', 'Planet Earth||h', 'The Great British Bake Off||h|bake off',
        'Phineas and Ferb||m', 'Gravity Falls||h', 'Dora the Explorer||e|dora', 'Masha and the Bear||e', 'Naruto||m', 'Dragon Ball||m|dragon ball z',
      ],
    },
    {
      id: 'desitv',
      en: 'Indian TV',
      hi: 'भारतीय टीवी',
      icon: '📡',
      kind: 'tv',
      regional: true,
      rows: [
        'Mahabharat|महाभारत|e', 'Ramayan|रामायण|e', 'Kaun Banega Crorepati|कौन बनेगा करोड़पति|e|KBC',
        'Taarak Mehta Ka Ooltah Chashmah|तारक मेहता का उल्टा चश्मा|m|tmkoc,taarak mehta', 'Shaktimaan|शक्तिमान|e', 'Malgudi Days|मालगुडी डेज़|h',
        'Chhota Bheem|छोटा भीम|e', 'Motu Patlu|मोटू पतलू|e', 'Panchayat|पंचायत|m', 'Kota Factory|कोटा फ़ैक्ट्री|m', 'Aspirants|एस्पिरेंट्स|h', 'Gullak|गुल्लक|h',
        'Indian Idol|इंडियन आइडल|e', 'Sarabhai vs Sarabhai|साराभाई वर्सेस साराभाई|m', 'Hum Paanch|हम पाँच|h', 'Office Office|ऑफ़िस ऑफ़िस|h',
        'Byomkesh Bakshi|ब्योमकेश बक्शी|h', 'Chandrakanta|चंद्रकांता|h', 'Vikram Aur Betaal|विक्रम और बेताल|m', 'Alif Laila|अलिफ़ लैला|h', 'CID|सीआईडी|e',
        'Bigg Boss|बिग बॉस|e', 'Roadies|रोडीज़|m', 'The Kapil Sharma Show|द कपिल शर्मा शो|e|kapil sharma show', 'Khichdi|खिचड़ी|m', 'Dekh Bhai Dekh|देख भाई देख|h',
        'Shrimaan Shrimati|श्रीमान श्रीमती|h', 'Jassi Jaissi Koi Nahin|जस्सी जैसी कोई नहीं|h', 'Dance India Dance|डांस इंडिया डांस|m', 'Sa Re Ga Ma Pa|सा रे गा मा पा|e',
        'Son Pari|सोन परी|m', 'Shararat|शरारत|m', 'Baal Veer|बालवीर|m', 'Rangoli|रंगोली|h', 'Chitrahaar|चित्रहार|h', 'Surabhi|सुरभि|h',
        'Balika Vadhu|बालिका वधू|m', 'Anupamaa|अनुपमा|m', 'Tu Tu Main Main|तू तू मैं मैं|h', 'Hero – Bhakti Hi Shakti Hai|हीरो – भक्ति ही शक्ति है|h|hero',
      ],
    },
    {
      id: 'sports',
      en: 'Cricket & Indian Sports Stars',
      hi: 'क्रिकेटर और खेल सितारे',
      icon: '🏏',
      kind: 'person',
      regional: true,
      rows: [
        '@Sachin Tendulkar|सचिन तेंदुलकर|e', '@Virat Kohli|विराट कोहली|e', '@MS Dhoni|एमएस धोनी|e|dhoni,mahendra singh dhoni', '@Rohit Sharma|रोहित शर्मा|e',
        '@Kapil Dev|कपिल देव|m', '@Sunil Gavaskar|सुनील गावस्कर|m', '@Sourav Ganguly|सौरव गांगुली|m', '@Rahul Dravid|राहुल द्रविड़|m', '@Anil Kumble|अनिल कुंबले|m',
        '@Yuvraj Singh|युवराज सिंह|m', '@Virender Sehwag|वीरेंद्र सहवाग|m', '@Jasprit Bumrah|जसप्रीत बुमराह|m', '@Hardik Pandya|हार्दिक पांड्या|m',
        '@Ravindra Jadeja|रवींद्र जडेजा|m', '@Smriti Mandhana|स्मृति मंधाना|h', '@Mithali Raj|मिताली राज|h', '@Harmanpreet Kaur|हरमनप्रीत कौर|h',
        '@Shubman Gill|शुभमन गिल|m', '@Rishabh Pant|ऋषभ पंत|m', '@Suryakumar Yadav|सूर्यकुमार यादव|h', 'Shane Warne|शेन वॉर्न|m', 'Brian Lara|ब्रायन लारा|m',
        'Don Bradman|डॉन ब्रैडमैन|h', 'Ricky Ponting|रिकी पोंटिंग|h', 'AB de Villiers|एबी डिविलियर्स|h', 'Chris Gayle|क्रिस गेल|m',
        'Muttiah Muralitharan|मुथैया मुरलीधरन|h', 'Ben Stokes|बेन स्टोक्स|h', '@Neeraj Chopra|नीरज चोपड़ा|m', '@PV Sindhu|पीवी सिंधु|m', '@Saina Nehwal|साइना नेहवाल|m',
        '@Milkha Singh|मिल्खा सिंह|m', '@PT Usha|पीटी उषा|h', '@Sunil Chhetri|सुनील छेत्री|h', '@Dhyan Chand|ध्यानचंद|h', '@Abhinav Bindra|अभिनव बिंद्रा|h',
        '@Sania Mirza|सानिया मिर्ज़ा|m', '@Viswanathan Anand|विश्वनाथन आनंद|h', '@Mary Kom|मैरी कॉम|m', '@Leander Paes|लिएंडर पेस|h',
        'Jacques Kallis|जैक्स कैलिस|h', 'Kane Williamson|केन विलियमसन|h', 'Joe Root|जो रूट|h', 'Steve Smith|स्टीव स्मिथ|h', 'Wasim Akram|वसीम अकरम|m',
      ],
    },
    {
      id: 'people',
      en: 'Famous People',
      hi: 'मशहूर लोग',
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
      hi: 'गाने',
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
      hi: 'जानवर',
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
      hi: 'कहावतें',
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
      hi: 'मुहावरे',
      icon: '🗣️',
      kind: 'phrase',
      regional: true,
      rows: [
        'Naach na jaane aangan tedha|नाच न जाने आँगन टेढ़ा|m', 'Oont ke munh mein jeera|ऊँट के मुँह में जीरा|m',
        'Bandar kya jaane adrak ka swaad|बंदर क्या जाने अदरक का स्वाद|e', 'Aasmaan se gira khajoor mein atka|आसमान से गिरा खजूर में अटका|m',
        'Ab pachhtaye hot kya jab chidiya chug gayi khet|अब पछताए होत क्या जब चिड़िया चुग गई खेत|h', 'Door ke dhol suhaane|दूर के ढोल सुहाने|m',
        'Ghar ki murgi daal barabar|घर की मुर्गी दाल बराबर|e', 'Jal mein rehkar magar se bair|जल में रहकर मगर से बैर|h',
        'Ulta chor kotwal ko daante|उल्टा चोर कोतवाल को डाँटे|m', 'Kaala akshar bhains barabar|काला अक्षर भैंस बराबर|m', 'Naak mein dum karna|नाक में दम करना|e',
        'Aankh ka taara|आँख का तारा|e', 'Hawa mein qile banana|हवा में क़िले बनाना|m', 'Ungli par nachana|उँगली पर नचाना|e', 'Paani paani hona|पानी पानी होना|e',
        'Lohe ke chane chabana|लोहे के चने चबाना|m', 'Nau do gyarah hona|नौ दो ग्यारह होना|m', 'Aag babula hona|आग बबूला होना|e', 'Daal mein kuch kaala hai|दाल में कुछ काला है|e',
        'Ek anaar sau beemar|एक अनार सौ बीमार|m', 'Jitni chaadar utne pair pasaro|जितनी चादर उतने पैर पसारो|h',
        'Haathi ke daant khane ke aur dikhane ke aur|हाथी के दाँत खाने के और दिखाने के और|h', 'Aa bail mujhe maar|आ बैल मुझे मार|e',
        'Khisiyani billi khamba noche|खिसियानी बिल्ली खंभा नोचे|h', 'Thotha chana baaje ghana|थोथा चना बाजे घना|h', 'Jiski lathi uski bhains|जिसकी लाठी उसकी भैंस|m',
        'Ek teer se do shikar|एक तीर से दो शिकार|e', 'Saanp bhi mar jaaye aur lathi bhi na toote|साँप भी मर जाए और लाठी भी न टूटे|h',
        'Kutte ki dum tedhi ki tedhi|कुत्ते की दुम टेढ़ी की टेढ़ी|m', 'Chaar din ki chandni|चार दिन की चाँदनी|m', 'Hatheli par sarson ugana|हथेली पर सरसों उगाना|h',
        'Aankhon mein dhool jhonkna|आँखों में धूल झोंकना|m', 'Sau sunar ki ek lohar ki|सौ सुनार की एक लोहार की|h', 'Bhains ke aage been bajana|भैंस के आगे बीन बजाना|e',
        'Naya nau din purana sau din|नया नौ दिन पुराना सौ दिन|h', 'Chor ki daadhi mein tinka|चोर की दाढ़ी में तिनका|m', 'Oonchi dukaan pheeka pakwaan|ऊँची दुकान फीका पकवान|m',
        'Der aaye durust aaye|देर आए दुरुस्त आए|e', 'Mann changa toh kathoti mein Ganga|मन चंगा तो कठौती में गंगा|h', 'Doobte ko tinke ka sahara|डूबते को तिनके का सहारा|m',
        'Apni gali mein kutta bhi sher|अपनी गली में कुत्ता भी शेर|e', 'Girgit ki tarah rang badalna|गिरगिट की तरह रंग बदलना|e', 'Pet mein chuhe daudna|पेट में चूहे दौड़ना|e',
      ],
    },
    {
      id: 'actions',
      en: 'Everyday Actions',
      hi: 'रोज़ के काम',
      icon: '🧹',
      kind: 'action',
      rows: [
        'Brushing teeth|दाँत साफ़ करना|e', 'Riding a bicycle|साइकिल चलाना|e', 'Flying a kite|पतंग उड़ाना|e', '@Rolling a chapati|रोटी बेलना|m|making roti',
        'Taking a selfie|सेल्फ़ी लेना|e', 'Swimming|तैरना|e', 'Washing clothes|कपड़े धोना|e', 'Reading a newspaper|अख़बार पढ़ना|e', 'Climbing stairs|सीढ़ियाँ चढ़ना|e',
        'Playing cricket|क्रिकेट खेलना|e', 'Dancing|नाचना|e', 'Cooking|खाना बनाना|e', 'Driving a car|गाड़ी चलाना|e', 'Catching a bus|बस पकड़ना|m',
        'Tying shoelaces|जूते के फीते बाँधना|m', 'Combing hair|बाल बनाना|e', 'Watering plants|पौधों को पानी देना|e', 'Sweeping the floor|झाड़ू लगाना|e',
        'Opening an umbrella|छाता खोलना|e', 'Drinking tea|चाय पीना|e', 'Eating ice cream|आइसक्रीम खाना|e', 'Blowing up a balloon|गुब्बारा फुलाना|e',
        'Sneezing|छींकना|e', 'Yawning|जम्हाई लेना|e', 'Waking up|जागना|e', 'Taking a photo|फ़ोटो खींचना|e', 'Playing the guitar|गिटार बजाना|e',
        'Playing the drums|ढोल बजाना|e', 'Fishing|मछली पकड़ना|e', 'Skipping rope|रस्सी कूदना|e', 'Juggling|गेंदें उछालना|m', 'Painting a wall|दीवार रंगना|m',
        'Walking a dog|कुत्ते को घुमाना|e', 'Typing on a laptop|लैपटॉप पर टाइप करना|m', 'Talking on the phone|फ़ोन पर बात करना|e', 'Ironing clothes|कपड़े इस्त्री करना|m',
        'Planting a tree|पेड़ लगाना|m', 'Building a sandcastle|रेत का महल बनाना|m', 'Doing yoga|योग करना|e', 'Lifting weights|वज़न उठाना|e', 'Ice skating|स्केटिंग करना|m',
        'Rowing a boat|नाव चलाना|m', 'Chopping vegetables|सब्ज़ी काटना|e', 'Wrapping a gift|तोहफ़ा लपेटना|m', 'Blowing out candles|मोमबत्तियाँ बुझाना|e',
        'Hanging clothes to dry|कपड़े सुखाना|m', 'Changing a light bulb|बल्ब बदलना|h', 'Threading a needle|सुई में धागा डालना|h',
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

  return { PACKS, DIFFICULTIES: ['easy', 'medium', 'hard'], getPack, defaultCategories, byKey, titleId };
});
