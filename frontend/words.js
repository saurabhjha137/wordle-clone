// Daily answer pool — rotates by day of year
const WORDS = [
  "about","above","abuse","actor","acute","admit","adopt","adult","after","again",
  "agent","agree","ahead","alarm","album","alert","alike","alive","alley","allow",
  "alone","along","aloud","alpha","altar","alter","angel","anger","angle","angry",
  "anime","ankle","annex","apart","apple","apply","arena","argue","arise","armor",
  "array","arrow","aside","asked","atlas","audio","audit","avoid","awake","award",
  "aware","awful","basic","basis","beach","began","begin","being","below","bench",
  "bible","birth","black","blade","blame","bland","blank","blast","blaze","bleed",
  "blend","bless","blind","block","blood","blown","blues","blunt","board","boast",
  "bonus","boost","bound","brain","brand","brave","bread","break","breed","brick",
  "brief","bring","broad","broke","brook","brown","build","built","bunch","burst",
  "buyer","cabin","cable","camel","candy","carry","catch","cause","cease","chain",
  "chair","chaos","charm","chart","chase","cheap","check","cheek","chess","chest",
  "chief","child","china","choir","chunk","civic","civil","claim","class","clean",
  "clear","clerk","click","cliff","climb","cling","clock","close","cloud","coach",
  "coast","color","comic","coral","count","cover","craft","crash","crazy","cream",
  "creek","crime","crisp","cross","crowd","crown","crush","crust","curve","cycle",
  "daily","dance","dealt","death","debug","debut","delay","delta","dense","depot",
  "depth","derby","devil","digit","dirty","disco","disco","ditch","divert","dizzy",
  "dodge","doing","donor","doubt","dough","draft","drain","drama","drank","drawn",
  "dream","dress","drift","drink","drive","drone","drove","drunk","dryer","dunno",
  "dying","eager","early","earth","eight","elite","ember","empty","enemy","enjoy",
  "enter","entry","equal","error","essay","event","every","exact","exist","extra",
  "fable","faced","faith","false","fancy","fatal","fault","feast","fiber","field",
  "fifth","fifty","fight","filed","final","fired","first","fixed","flame","flash",
  "fleet","flesh","float","flood","floor","fluid","focus","force","forge","forth",
  "forum","found","frame","frank","fraud","fresh","front","froze","fruit","fully",
  "funny","gains","gamma","ghost","given","gland","glass","globe","gloom","glove",
  "going","grace","grade","grail","grand","grant","grape","grasp","grass","grave",
  "great","green","greet","grief","grind","groan","group","grove","grown","guard",
  "guess","guest","guide","guild","guilt","gusto","hands","happy","harsh","heart",
  "heavy","hence","herbs","hinge","hippo","honey","honor","horse","hotel","house",
  "human","humor","hurts","hyper","ideal","image","imply","inbox","index","indie",
  "infer","inner","input","inter","ionic","issue","ivory","jazz","jewel","joint",
  "judge","jumbo","jumpy","karma","keen","kneel","knife","knock","known","label",
  "lance","large","laser","later","laugh","layer","learn","lease","least","leave",
  "ledge","legal","lemon","level","light","limit","linen","liner","liver","local",
  "lodge","logic","loose","lover","lower","lucky","lunar","lyric","magic","major",
  "maker","manor","maple","march","match","mayor","media","mercy","merge","merit",
  "metal","midst","might","minor","minus","model","month","moral","motor","mount",
  "mouse","mouth","moved","movie","music","naive","nerve","never","night","ninja",
  "noble","noise","north","noted","novel","nurse","nymph","occur","ocean","offer",
  "often","olive","onion","onset","opera","orbit","order","other","ought","outer",
  "oxide","ozone","paint","panel","panic","paper","patch","pause","peace","pearl",
  "perch","phase","phone","photo","piano","piece","pilot","pinch","pixel","pizza",
  "place","plain","plane","plant","plate","plaza","plead","pluck","point","polar",
  "pound","power","press","price","pride","prime","print","prior","probe","prose",
  "proud","prove","pulse","punch","pupil","queen","quest","queue","quick","quiet",
  "quota","quote","radar","radio","raise","rally","range","rapid","ratio","reach",
  "ready","realm","rebel","refer","reign","relax","reply","reset","rider","right",
  "rigid","risky","rival","river","robot","rocky","rouge","rough","round","royal",
  "ruler","rural","sadly","saint","salad","sauce","scale","scene","scope","score",
  "scout","seize","sense","serve","setup","seven","shape","share","sharp","shift",
  "shiny","shirt","shook","shoot","shore","short","shout","shrug","siege","sight",
  "sigma","silly","since","sixth","sixty","skill","sleep","slice","slide","slope",
  "smart","smile","smoke","snack","snake","solar","solid","solve","sorry","sound",
  "south","space","spark","spawn","speak","speed","spend","spice","spike","spine",
  "spoke","spook","sport","squad","stack","staff","stage","stain","stall","stamp",
  "stand","stark","start","state","stays","steam","steel","steep","steer","stern",
  "stick","stiff","still","stock","stone","stood","store","storm","story","stove",
  "strap","straw","stray","strip","strut","stuck","study","style","sugar","suite",
  "sunny","super","surge","swamp","sweep","sweet","swept","swift","sword","sworn",
  "table","taken","taste","teach","tense","terms","thank","their","theme","there",
  "thick","thing","think","third","those","three","threw","throw","tiger","tight",
  "timed","tired","title","today","token","total","touch","tough","tower","toxic",
  "trace","track","trade","trail","train","trait","trash","treat","trend","trial",
  "tribe","trick","tried","troop","truck","truly","trust","truth","tumor","tuner",
  "twice","twirl","twist","tying","ultra","under","unify","union","unite","unity",
  "until","upper","upset","urban","usage","usual","valid","value","valve","venom",
  "verse","video","vigor","viral","virus","visit","vital","vivid","vocal","voice",
  "voter","wagon","waste","watch","water","weary","weave","weird","whale","wheat",
  "where","which","while","whole","whose","wider","wield","witch","woman","women",
  "world","worry","worse","worst","worth","would","wound","wrist","write","wrong",
  "yield","young","yours","youth","zero","zebra","zonal"
];

// Valid guesses = all words in WORDS + extra common 5-letter words
const VALID_GUESSES = new Set(WORDS);

// Pick today's word deterministically by day-of-year
function getDailyWord() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day   = Math.floor((now - start) / 86400000);
  return WORDS[day % WORDS.length].toUpperCase();
}

function getWordByIndex(idx) {
  return WORDS[((idx % WORDS.length) + WORDS.length) % WORDS.length].toUpperCase();
}
