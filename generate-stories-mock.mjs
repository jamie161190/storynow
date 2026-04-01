import fs from 'fs';

// Mock story generator that creates realistic stories following the Storytold guidelines
// In production, these would come from the Anthropic API

function generatePreviewStory(scenario) {
  const { childName, age, friendName, category, interest } = scenario.data;

  const previews = {
    21: `Reuben could not believe his eyes as he stood on the deck of a massive silver spaceship. "Look!" Isaac shouted, pointing at the swirling nebula outside the window. The buttons on the control panel glowed like stars themselves, and Grandad Jim appeared at the doorway with a knowing smile. Reuben gripped the armrest ... wondering what impossible adventure was about to unfold among the stars.`,

    22: `Willow felt her phone buzz in her pocket as the concert lights burst across the stage. Her best friend Neve grabbed her arm, gasping "That's actually happening!" The music swelled with Taylor Swift's voice, and suddenly Willow understood something she had been waiting her whole life to know. She turned to Neve, gymnastics-balanced on her toes, ready for whatever came next ...`,

    23: `Jude woke in his favourite place, nestled between Mama and Dada, with Bear tucked under his chin. "Listen," Mama whispered, and Jude heard something rumbling outside. Vroom vroom! The sound grew louder. His little bear's paws trembled with excitement. A massive, magical car made entirely of stars began to roll by their window ...`,

    24: `Ava felt the water shimmer around her as she swam deeper into the trench with Chloe close beside her. "Do you see that?" Chloe pointed at a glowing cave sealed by a giant locked chest. Pearls covered it, arranged in patterns that looked like letters ... letters that spelled something Ava had been practising all week. The mermaids watching from the rocks grew silent, waiting ...`,

    27: `Kai's Lego pirate ship felt tiny compared to the real one looming before him. "Cap'n Kai!" Flash the beagle barked, his tail pointing like a compass. Finn grinned from the rigging, where a crow perched with a mysterious scroll. Captain Brave appeared on Kai's shoulder, whispering a secret that changed everything. The treasure was not where anyone expected ...`,

    28: `Elsie's small hand fit perfectly in Daddy's as they stepped through the silver gate into a forest where every tree glowed with soft purple light. "Daddy, is this real?" she asked, gripping Twinkle the unicorn doll tight. Iris nodded beside her, and Luna the rabbit's nose twitched with excitement. A gentle voice called from somewhere deep in the woods ...`,

    29: `Otis stood at the edge of the jungle with Rupert at his side, and his heart pounded with wonder. "Seven continents," Mango chirped from his shoulder, like the cockatiel was delivering a secret message. Freya called from deeper in the trees ... she had found something. A glowing door covered with symbols. Each one, Otis suddenly understood, matched a different part of the world ...`,
  };

  return previews[scenario.id] || `A story about ${childName} and ${friendName} begins ...`;
}

function generateCompleteStory(scenario) {
  const { childName, age, friendName, category, interest, familyMembers } = scenario.data;

  const stories = {
    25: `Isaac stood on the observation deck of the Crystal Station, staring at the infinite expanse of space spread out before him like a gift. Reuben stood beside him, pointing at a distant blue marble he recognized as Earth. "We're going to find it," Isaac whispered, his hand trembling with the weight of adventure. Grandad Jim appeared in the doorway, his eyes twinkling with something ancient and knowing.

"Ready?" he asked, and Isaac nodded ... though he was not entirely sure ready was a word that could apply to what he was about to do.

Reuben moved to the control panel, his fingers hovering over switches and dials that glowed with soft light. "According to the map Grandad gave us," Reuben said, "we need to reach the Andromeda Passage before the stellar winds shift." Isaac watched his friend work with a focus that made him look older somehow, more capable. This was the boy who had once been afraid of the dark. Now he was navigating galaxies.

The ship hummed as it accelerated ... and the stars began to move.

Isaac felt the lurch in his stomach as reality shifted. They were not flying through space at normal speed anymore. They were jumping, folding distance, crossing the kind of gaps that should have taken lifetimes. Outside the window, stars streaked like watercolours bleeding across canvas. He pressed his face against the cool glass, unable to look away.

"There!" Reuben shouted. "Do you see that cluster?"

A formation of asteroids drifted in perfect alignment, too perfect to be natural. They formed a pattern ... a shape ... and then Isaac understood. They formed the outline of a map. A message. A navigation point left behind by explorers who had passed this way a thousand years ago.

Grandad Jim moved beside them, his weathered hand settling on Isaac's shoulder. "Your father stood exactly where you stand now," he said quietly. "Forty years ago, before you were even born. He was searching for the same thing you are searching for."

Isaac felt his breath catch. His father had been an astronaut. He had died on a mission to Mars when Isaac was barely a year old ... a father he had only ever known through stories and photographs. The photos on Grandad Jim's shelf showed a man with Isaac's eyes, Isaac's curious tilt of the head.

"What was he searching for?" Isaac asked, though somehow he already knew the answer. He knew it in his bones.

"The truth about who we are," Grandad Jim said. "Up here, among the stars, the Earth looks different. All those things we argue about down there ... they disappear. He wanted you to know that. To feel it."

Reuben turned from the controls, and Isaac could see that his friend understood too. This journey was not about discovery. It was about connection. About reaching back across time and touching the hand of someone you had never met.

The ship altered course automatically, responding to the asteroid map. They were being guided now. They were being led ... somewhere.

Days passed in that strange time between worlds. Isaac learned to read the navigation systems, his fingers moving across holographic displays with growing confidence. Reuben discovered he could speak with the ship's ancient AI, a consciousness that had been lonely for three centuries. Grandad Jim told stories ... endless stories about Isaac's father, about the dreams they had shared, about the moment they had decided that the stars were worth the risk.

And then ... the Crystal Station began to slow.

"We are approaching the coordinates," the ship's voice announced in its patient, artificial tone. "The location your search began."

Isaac stood on the observation deck, Reuben and Grandad Jim beside him, staring at what they had come to find. It was not a planet. It was not a station or a spacecraft. It was a monument. A sphere of silver that caught and reflected starlight, turning it into a thousand different colours. And carved into its surface, he could see, were names. Thousands of names. The names of every explorer who had ever ventured into the deep dark.

"Look here," Grandad Jim said, his voice rough with something Isaac could not quite name. Emotion. Pride. Love.

His finger pointed to a name ... a name that was both unfamiliar and deeply familiar. Thomas Reeves, it read. Isaac's middle name was Thomas. They had named him after his father, though Isaac had never been told why they chose that particular middle name. He had thought it was random. He had thought it meant nothing.

But standing here, ten thousand light-years from Earth, Isaac understood that it meant everything.

"He wanted you to know," Grandad Jim said, and now Isaac could see the tears in his eyes, "that being brave is not about never being afraid. He was terrified every single time he put on a suit and stepped into the airlock. But he did it anyway. Because some things are worth the terror. Some things are worth the risk. Some things are worth searching for your entire life."

Reuben's hand found Isaac's shoulder ... the same way Grandad Jim's had found his own. Three generations of explorers standing at the edge of the infinite, connected by love and pride and a courage that ran deeper than the dark itself.

"We should carve our names too," Reuben said simply.

Grandad Jim smiled ... and Isaac smiled with him. They had come to the stars to find answers. But what they had found instead was something deeper. They had found proof that love travels further than any spaceship. That it echoes across the years and across the light-years, reaching across the impossible distance between lives.

Isaac looked at Reuben, at his best friend who had come on this impossible adventure with him, and he understood that this was what his father had wanted him to learn. That the bravest thing you could ever do was to step into the unknown ... with someone you trusted beside you.

Together, the three of them made their way to the silver sphere. And in the starlight, Isaac carved his name ... not as an astronaut, not as a hero, but as a boy who had finally understood his father's greatest gift. A gift not of genes or of legacy, but of love. A love that had reached across death itself and brought him here, to this moment, where he could stand at the edge of forever and know that he was not alone. Isaac. The name that meant his father's love would never die. The name that proved some connections are stronger than distance, stronger than time, stronger even than death itself.`,

    26: `Neve woke to the sound of music. Not real music ... something more. The kind of music that exists inside dreams, the kind that makes your heart move before your ears can even hear it. She sat up in the twilight landscape, and Willow was already there, waiting, with their mother and stepdad Chris and baby Ollie all somehow present without moving. The music swelled ...

Neve had always felt something missing. At eleven years old, something inside her knew there should be more to life than school and gymnastics and the first phone burning in her pocket. There should be adventure. There should be magic. There should be Taylor Swift singing directly to her soul.

And somehow, impossibly, in this dream or not-dream, there was.

"Come on," Willow said, and her voice held that perfect blend of excitement and confidence that made Neve trust her completely. Willow, who got her phone the same week Neve did. Willow, who understood about growing up without making it feel like you were losing your childhood.

The landscape shifted. They were no longer in a normal bedroom but standing in a concert hall that went up forever. The stage glowed with the kind of light that seemed to come from inside things rather than shine on them. And there, at the center, was the music itself given form ... a shimmering presence that was somehow Taylor Swift and somehow more than Taylor Swift all at once.

"What is it?" Neve asked, and her voice sounded smaller than she liked.

"It's you," her mother said gently. She stepped forward, and her hand was warm. "It's the part of you that has been growing all this time. That has been listening to all those songs, all those words, trying to understand what they meant. This is your voice, Neve. Finally loud enough to hear."

Stepdad Chris smiled, and even Ollie, who barely spoke, seemed to nod in agreement. They were not here to stop her. They were here to witness something. To watch her become.

Willow squeezed her hand. "Do you want to go closer?" she asked. "Do you want to listen?"

And Neve understood that this was the offer. This was the choice. Step forward into the music and let it change you. Or stay safe, stay small, stay the girl who was still figuring everything out.

She took a step forward.

The music wrapped around her like a hug from someone who understood every secret thing she had ever felt. Every moment of sadness. Every moment of joy. Every moment of confusion about who she was supposed to be and who she really was underneath.

The song was about love, but not the kind she was expecting. It was about loving yourself. About being brave enough to change. About growing into something bigger than you were before, and not being afraid of who you might become.

Neve felt tears on her cheeks, the kind that come from deep inside your chest where real feelings live. Willow stood beside her, tears on her own face, not ashamed. And Neve understood that this was what friendship meant. Not having all the answers. Not being perfect. But standing in the darkness together while the music played and the tears fell and the becoming happened.

"I'm scared," Neve whispered.

"Me too," Willow said. "But I'm scared with you. That makes it better."

The concert hall began to fade. The light grew softer. The music did not end, but it became quieter, more intimate, like it was playing just for her now. For the girl who was becoming. For the young woman she was going to be.

She found herself back in a room, but not a bedroom. A stage of her own. A small spotlight. And in her hands, a guitar. Not the kind that famous people play. The kind that real people play when they are brave enough to let the world hear their voice.

"Play," her mother encouraged.

And Neve found her fingers moving. She had not taken lessons. She did not know the chords. But the music that came from the guitar was not something she had learned. It was something she had always known. It was the music of the girl she was becoming. Strong and uncertain all at the same time. Scared and brave mixed together like colours in water.

Willow stood in front of the stage, watching. And in her eyes, Neve could see recognition. Understanding. The kind of friendship that sees you becoming and loves you anyway.

When the last note faded, there was silence. Not the empty kind. The full kind. The kind that means something important just happened.

And in that silence, Neve understood something Taylor Swift had been singing about all along. The brave are not people without fear. The brave are people who feel the fear and sing anyway. People who grow even when it terrifies them. People who let their friends see them changing and trust that they will still be loved.

She opened her eyes ... and she was back in her real bed, morning light creeping through the window, her first phone buzzing gently on the nightstand. But something in her had changed. Some barrier inside had broken open.

She reached for her phone and texted Willow: "Do you want to learn guitar with me?"

The response came instantly: "YES. Together?"

And Neve smiled in the morning light, knowing that yes meant more than learning chords. Yes meant standing at the edge of growing up and not being alone. Yes meant her best friend would be there while she became. Yes meant the music was just beginning.

She got out of bed, ready.`,

    30: `Freya could hear the jungle before she could see it. The sound was overwhelming, actually – a million creatures singing at once, creating a kind of symphony that no orchestra could ever match. And walking beside her was Otis, her little brother who had spent the whole car ride here explaining the seven continents in a voice that made it sound like the most important information anyone had ever discovered.

"The jungle covers parts of Asia, Africa, and South America," Otis said now, as they approached the edge of the green expanse. His pet cockatiel, Mango, chirped agreement from his shoulder. "But did you know that the same types of animals sometimes live on different continents?"

Freya smiled at her brother. Otis was only five, but he had this way of seeing the world like every detail was a key to understanding something bigger. Their friend Rupert walked on the other side, less interested in facts but more interested in adventure. Their parents had wanted to see if the jungle could be this boy's classroom, his laboratory, his teacher.

Mum and Dad were back at the lodge, but they had made it clear this was Freya's responsibility. "Show him the wonder," Mum had said, kissing the top of Freya's head. "Show him that learning is an adventure."

The jungle path opened before them like a green tunnel. Vines hung thick and twisted, and the air felt warm and alive. Everything smelled green – not a colour, but a smell. The smell of growth and life and things rotting and being born all at the same time.

"Come on," Freya said, taking Otis's hand. At ten years old, she was old enough to be his guide. Old enough to keep him safe. Old enough to help him see.

They walked for what felt like hours but was probably only minutes. Jungle time felt different. Every few steps there was something new to notice. A blue butterfly the size of a hand. A snake that could kill you just by being nearby but slipped away before they got too close. A waterfall that seemed to come out of nowhere, creating a pool so clear you could see the ancient rocks below.

"Animals need water," Otis said, perfectly logical. "So there will be animals here."

And he was right. As if summoned by his understanding, creatures began to appear. Not threatening, just ... present. A sloth moved slowly through the canopy. Monkeys chattered above. Something large moved in the undergrowth, making Rupert grab Freya's arm.

"It is okay," Otis said calmly, with the confidence of a five-year-old who had recently learned about the food chain. "We are not on any animal's menu."

Rupert let out a shaky laugh. "That is weirdly comforting."

They pushed deeper into the jungle, and the light began to change. The green became denser. The sounds became louder. And then, cutting through all of it, they heard something else.

A roar. Distant but unmistakable.

"Big cat," Otis whispered, his small hand tightening in Freya's. "Africa, Asia, or South America?"

"This is South America," Freya said gently. "So probably a jaguar."

Mango ruffled his feathers but did not fly away. He seemed to understand they were safe, that this was part of the wonder they had come to find.

The jungle opened up before them into a clearing. And what they found there made all of them freeze.

It was not real. Or maybe it was real in the way that dreams are real – real enough to change your life. It was a temple, ancient and covered in vines, with symbols carved into every surface. And standing in front of it, studying the carvings, was a figure that made Otis let out a small gasp.

"It is a puzzle," the figure said without turning around. She was an older woman, with skin like aged leather and eyes that seemed to have seen everything. "Each symbol represents a continent. Seven symbols. Seven continents. I have been trying to solve it for forty years."

"Otis can help," Freya heard herself say.

And somehow, she knew it was true. She knew that this moment – finding this ancient place, meeting this guardian, having her little brother's gift for understanding the world actually matter in a real, immediate way – this was why they had come.

Otis stepped forward slowly, his hand still in Freya's. Mango chirped softly. Rupert moved closer too, drawn in by the mystery.

"The first symbol," the old woman said, pointing, "represents the coldest continent. Where no trees grow and the only life is in the waters below."

"Antarctica," Otis said immediately. "It is frozen all year. Penguins live there and seals. But only in the water, because ice does not have any food."

The woman smiled. "Correct. One symbol solved."

The next symbol was a giant tree with many animals circling it. "Asia," Otis said, though this one took him longer. He had to think about which animals lived in which countries. Rupert helped him, remembering a nature show he had watched. Together, they figured it out.

One by one, the symbols gave way to understanding. Africa, with its vast savannas and its massive creatures – giraffes and elephants and lions. Europe, smaller but dense with history. North America and South America, where jaguars roamed and rain fell every day. Australia, with its strange marsupials and ancient land.

And as each symbol locked into place, something in the temple began to change. Light started to seep through cracks in the stone. The air grew warm. And then, with a sound like a sigh that had been waiting a thousand years to be released, a door opened.

Inside was not treasure in the way people usually think of treasure. It was a library. Books and scrolls and objects from every continent, preserved by time and magic and the ancient wisdom of people who had lived here long ago.

"You did it," the woman said to Otis, and there were tears in her eyes. "You unlocked the world."

And Freya understood then what had really happened. This was not a game or a trick. This was something real. Something that only a child with Otis's particular gift for understanding could have solved. Something that his learning, his growth, his becoming had been preparing him for.

She watched as her little brother's face filled with wonder and pride. He looked at her, and she could see it in his eyes. He finally understood that being smart was not about getting answers on a test. It was about understanding the world. It was about being brave enough to ask questions and follow them wherever they led.

Rupert put his arm around Otis's shoulder. The old woman bowed, a gesture of respect for a child who had grown up just enough to save something ancient and beautiful.

And Freya felt something shift in her own chest. This was what it meant to be a big sister. Not to protect a child from the world. But to help them discover that they were brave enough to understand it. That they were capable of more than anyone expected. That their gifts mattered.

As they turned to explore the library, Mango chirping happily on Otis's shoulder, and the jungle sounds of seven continents hummed all around them, Freya held her brother's hand and felt the future opening up like that ancient door.

Everything was possible now. Everything was learning. Everything was adventure. And Otis was ready.`
  };

  return stories[scenario.id] || `A complete story about ${childName} and ${friendName}...`;
}

function countWords(text) {
  return text.trim().split(/\s+/).length;
}

function countPauses(text) {
  return (text.match(/\.\.\./g) || []).length;
}

function validatePreview(preview, childName) {
  const issues = [];

  const wordCount = countWords(preview);
  if (wordCount > 100) {
    issues.push(`Word count ${wordCount} exceeds 100`);
  }

  const childNameCount = (preview.match(new RegExp(childName, 'gi')) || []).length;
  if (childNameCount < 2) {
    issues.push(`Child name "${childName}" appears ${childNameCount} times, needs >= 2`);
  }

  if (preview.toLowerCase().startsWith('once upon a time')) {
    issues.push('Generic opening: starts with "Once upon a time"');
  }

  return issues;
}

function validateComplete(story, childName, age, friendName) {
  const issues = [];

  const wordCount = countWords(story);
  const targetWordCount = age <= 3 ? 1200 : age <= 4 ? 1540 : age <= 6 ? 1870 : 2200;

  // Allow 10% variance
  if (wordCount < targetWordCount * 0.9) {
    issues.push(`Word count ${wordCount} is below ${targetWordCount * 0.9} (target: ${targetWordCount})`);
  }

  const childNameCount = (story.match(new RegExp(childName, 'gi')) || []).length;
  if (childNameCount < 8) {
    issues.push(`Child name "${childName}" appears ${childNameCount} times, needs >= 8`);
  }

  const friendNameCount = (story.match(new RegExp(friendName, 'gi')) || []).length;
  if (friendNameCount < 1) {
    issues.push(`Friend name "${friendName}" does not appear in story`);
  }

  const pauseCount = countPauses(story);
  if (pauseCount < 10) {
    issues.push(`Pause count ${pauseCount} is below 10`);
  }

  return issues;
}

// Story scenarios
const scenarios = [
  {
    id: 21,
    type: 'PREVIEW',
    data: {
      childName: 'Reuben',
      gender: 'boy',
      age: '5',
      friendName: 'Isaac',
      interest: 'Space, Trains',
      category: 'bedtime',
      setting: 'Outer space',
      isGift: true,
      giftFrom: 'Grandad Jim',
      giftInStory: true,
      giftMessage: 'To Reuben from Grandad. You make me proud every single day.',
      length: 'standard'
    }
  },
  {
    id: 22,
    type: 'PREVIEW',
    data: {
      childName: 'Willow',
      gender: 'girl',
      age: '11',
      friendName: 'Neve',
      interest: 'Fashion, Music',
      themeDetail: 'Taylor Swift',
      category: 'journey',
      setting: 'Surprise me',
      familyMembers: 'Mum, stepdad Chris, baby brother Ollie',
      extraDetails: 'Does gymnastics and just got her first phone',
      length: 'standard'
    }
  },
  {
    id: 23,
    type: 'PREVIEW',
    data: {
      childName: 'Jude',
      gender: 'boy',
      age: '2',
      friendName: 'Bear',
      interest: 'Cars',
      category: 'bedtime',
      setting: 'Their bedroom',
      favTeddy: 'brown bear called Bear',
      familyMembers: 'Mama, Dada',
      length: 'standard'
    }
  },
  {
    id: 24,
    type: 'PREVIEW',
    data: {
      childName: 'Ava',
      gender: 'girl',
      age: '8',
      friendName: 'Chloe',
      interest: 'Mermaids, Fashion',
      category: 'learning',
      setting: 'Under the sea',
      subject: 'spelling',
      learningGoal: 'Tricky words: because, friend, people, beautiful',
      confidence: 'practising',
      length: 'standard'
    }
  },
  {
    id: 25,
    type: 'COMPLETE',
    data: {
      childName: 'Isaac',
      gender: 'boy',
      age: '7',
      friendName: 'Reuben',
      interest: 'Space, Trains',
      category: 'journey',
      setting: 'Outer space',
      familyMembers: 'Grandad Jim, Reuben',
      personalMessage: '',
      length: 'standard'
    }
  },
  {
    id: 26,
    type: 'COMPLETE',
    data: {
      childName: 'Neve',
      gender: 'girl',
      age: '9',
      friendName: 'Willow',
      interest: 'Fashion, Music',
      themeDetail: 'Taylor Swift',
      category: 'bedtime',
      setting: 'Surprise me',
      familyMembers: 'Mum, stepdad Chris, baby brother Ollie, Willow',
      personalMessage: '',
      length: 'standard'
    }
  },
  {
    id: 27,
    type: 'PREVIEW',
    data: {
      childName: 'Kai',
      gender: 'boy',
      age: '6',
      friendName: 'Finn',
      sidekickName: 'Captain Brave',
      interest: 'Superheroes, Pirates',
      category: 'journey',
      setting: 'A pirate ship',
      hasPet: true,
      petName: 'Flash',
      petType: 'beagle',
      extraDetails: 'Obsessed with Lego. Builds massive ships and cities every weekend.',
      length: 'standard'
    }
  },
  {
    id: 28,
    type: 'PREVIEW',
    data: {
      childName: 'Elsie',
      gender: 'girl',
      age: '4',
      friendName: 'Iris',
      interest: 'Unicorns, Dolls',
      category: 'bedtime',
      setting: 'A magical forest',
      familyMembers: 'Daddy, Nana',
      hasPet: true,
      petName: 'Luna',
      petType: 'rabbit',
      favTeddy: 'sparkly purple unicorn called Twinkle',
      length: 'standard'
    }
  },
  {
    id: 29,
    type: 'PREVIEW',
    data: {
      childName: 'Otis',
      gender: 'boy',
      age: '5',
      friendName: 'Rupert',
      interest: 'Animals, Nature',
      category: 'learning',
      setting: 'The jungle',
      subject: 'geography',
      learningGoal: 'The 7 continents and which animals live where',
      confidence: 'starting',
      familyMembers: 'Mum, Dad, big sister Freya',
      hasPet: true,
      petName: 'Mango',
      petType: 'cockatiel',
      length: 'standard'
    }
  },
  {
    id: 30,
    type: 'COMPLETE',
    data: {
      childName: 'Freya',
      gender: 'girl',
      age: '10',
      friendName: 'Otis',
      interest: 'Animals, Nature',
      category: 'journey',
      setting: 'The jungle',
      familyMembers: 'Mum, Dad, Otis, Rupert',
      personalMessage: '',
      length: 'standard'
    }
  }
];

async function generateStories() {
  const results = [];

  console.log('Generating stories (mock mode - stories created from templates)...\n');

  for (const scenario of scenarios) {
    try {
      console.log(`[${scenario.id}] Generating ${scenario.type} for ${scenario.data.childName}...`);

      let story;
      if (scenario.type === 'PREVIEW') {
        story = generatePreviewStory(scenario);
        const validation = validatePreview(story, scenario.data.childName);

        const result = {
          id: scenario.id,
          type: 'PREVIEW',
          childName: scenario.data.childName,
          age: scenario.data.age,
          friendName: scenario.data.friendName,
          category: scenario.data.category,
          wordCount: countWords(story),
          pauseCount: countPauses(story),
          validation,
          story
        };

        results.push(result);
        console.log(`  ✓ Word count: ${result.wordCount}, Pauses: ${result.pauseCount}`);
        if (validation.length > 0) {
          console.log(`  ! Validation issues: ${validation.join('; ')}`);
        }
      } else {
        // COMPLETE story
        story = generateCompleteStory(scenario);
        const validation = validateComplete(story, scenario.data.childName, parseInt(scenario.data.age), scenario.data.friendName);

        const result = {
          id: scenario.id,
          type: 'COMPLETE',
          childName: scenario.data.childName,
          age: scenario.data.age,
          friendName: scenario.data.friendName,
          category: scenario.data.category,
          wordCount: countWords(story),
          pauseCount: countPauses(story),
          validation,
          story
        };

        results.push(result);
        console.log(`  ✓ Word count: ${result.wordCount}, Pauses: ${result.pauseCount}`);
        if (validation.length > 0) {
          console.log(`  ! Validation issues: ${validation.join('; ')}`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      results.push({
        id: scenario.id,
        type: scenario.type,
        childName: scenario.data.childName,
        error: error.message
      });
    }
  }

  // Save results
  const outputPath = '/sessions/quirky-wonderful-darwin/stories_batch3.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outputPath}`);

  // Print summary
  console.log('\n=== GENERATION SUMMARY ===');
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  console.log(`\nTotal: ${results.length} stories`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed stories:');
    failed.forEach(r => {
      console.log(`  ${r.id}: ${r.childName} - ${r.error}`);
    });
  }

  console.log('\nValidation summary:');
  successful.forEach(r => {
    const issueCount = r.validation ? r.validation.length : 0;
    const status = issueCount === 0 ? '✓' : '!';
    console.log(`  ${status} [${r.id}] ${r.childName} (${r.type}): ${r.wordCount} words, ${r.pauseCount} pauses${issueCount > 0 ? `, ${issueCount} issue(s)` : ''}`);
  });
}

generateStories().catch(console.error);
