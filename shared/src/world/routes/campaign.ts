import { biomeOf, stageOf, BIOME_IDS, type BiomeId, type MapId } from '../biomes.js';
import type { Point, Obstacle } from '../map.js';
import { rect, road, surround, wall, type Route } from './layout.js';

// Each row is an authored itinerary, not a random seed or a mirrored copy.
const itineraries: Record<BiomeId, readonly (readonly [number, number][])[]> = {
  desert: [
    [
      [650, 790],
      [1100, 600],
      [1650, 700],
      [2200, 440],
      [2880, 520],
    ],
    [
      [650, 650],
      [1080, 300],
      [1570, 320],
      [1990, 760],
      [2870, 740],
    ],
    [
      [620, 820],
      [1150, 760],
      [1150, 270],
      [1950, 270],
      [2440, 650],
      [3010, 650],
    ],
    [
      [650, 500],
      [1150, 230],
      [1660, 610],
      [2140, 800],
      [2690, 360],
      [3130, 360],
    ],
  ],
  forest: [
    [],
    [
      [640, 790],
      [1050, 480],
      [1510, 260],
      [1930, 630],
      [2560, 740],
      [3020, 450],
    ],
    [
      [680, 580],
      [1160, 260],
      [1670, 260],
      [1700, 780],
      [2510, 780],
      [3000, 350],
    ],
    [
      [680, 800],
      [1110, 620],
      [1430, 290],
      [2150, 290],
      [2530, 640],
      [3100, 480],
    ],
  ],
  castle: [
    [],
    [
      [690, 790],
      [1050, 300],
      [1560, 300],
      [1940, 700],
      [2470, 700],
      [3010, 380],
    ],
    [
      [650, 500],
      [1070, 500],
      [1070, 220],
      [1780, 220],
      [2180, 790],
      [2950, 790],
    ],
    [
      [700, 780],
      [1220, 780],
      [1220, 260],
      [2030, 260],
      [2490, 520],
      [3070, 520],
    ],
  ],
  mountain: [
    [],
    [
      [710, 800],
      [1540, 800],
      [1540, 530],
      [820, 530],
      [820, 220],
      [2500, 220],
      [3070, 490],
    ],
    [
      [680, 750],
      [1260, 450],
      [1890, 780],
      [2300, 400],
      [2890, 240],
    ],
    [
      [700, 820],
      [2250, 820],
      [2250, 500],
      [1450, 500],
      [1450, 190],
      [3040, 190],
    ],
  ],
  paradise: [
    [],
    [
      [700, 700],
      [1140, 320],
      [1770, 320],
      [2150, 650],
      [2800, 650],
      [3060, 320],
    ],
    [
      [650, 800],
      [1290, 800],
      [1290, 290],
      [2190, 290],
      [2190, 760],
      [3060, 760],
    ],
    [
      [680, 520],
      [1210, 250],
      [1670, 520],
      [2250, 780],
      [2720, 300],
      [3090, 300],
    ],
  ],
  hell: [
    [],
    [
      [680, 800],
      [1080, 400],
      [1520, 680],
      [1960, 280],
      [2590, 280],
      [3030, 660],
    ],
    [
      [650, 600],
      [1160, 230],
      [1690, 230],
      [1690, 780],
      [2450, 780],
      [3070, 460],
    ],
    [
      [680, 810],
      [1190, 580],
      [1590, 220],
      [2150, 220],
      [2530, 700],
      [3110, 700],
    ],
  ],
};
export const STAGE_NAMES: Record<BiomeId, readonly [string, string, string, string, string]> = {
  desert: [
    'Whispering Dunes',
    'Glass Oasis',
    'Buried Necropolis',
    'Scorpion Expanse',
    'The Sunken Colosseum',
  ],
  forest: [
    'Briar Trail',
    'Demonwood Hollow',
    'Moonwater Marsh',
    'Thornheart Grove',
    'The Antler Sanctuary',
  ],
  castle: [
    'Outer Ramparts',
    'The Iron Barracks',
    'Gallery of Hexes',
    'The Blood Chapel',
    'Throne of the Demoniac King',
  ],
  mountain: [
    'Frostbound Pass',
    'Wolfwind Ridge',
    'Crystal Ravine',
    'Thunderhead Summit',
    'The Grizzly Amphitheatre',
  ],
  paradise: [
    'The Sunlit Garden',
    'Orchard of Echoes',
    'The Broken Aqueduct',
    'Stairway of Judgement',
    'The Shattered Firmament',
  ],
  hell: [
    'Basalt Crossing',
    'The Cinder Foundry',
    'River of Souls',
    'Obsidian Cathedral',
    'The Gargoyle Caldera',
  ],
};
const boundary: Record<BiomeId, Obstacle['kind']> = {
  desert: 'sand',
  forest: 'water',
  castle: 'stone',
  mountain: 'chasm',
  paradise: 'chasm',
  hell: 'lava',
};
export function campaignRoute(id: MapId): Route {
  const biome = biomeOf(id),
    stage = stageOf(id),
    index = BIOME_IDS.indexOf(biome);
  if (stage === 5) {
    const center = { x: 2310 + index * 65, y: 500 + (index % 2) * 30 };
    const arenas: Record<BiomeId, readonly ReturnType<typeof rect>[]> = {
      desert: [rect(1600, 170, 1600, 680), rect(1850, 90, 1100, 840)],
      forest: [rect(1550, 260, 1730, 540), rect(1790, 100, 1250, 810)],
      castle: [rect(1570, 120, 1660, 790)],
      mountain: [rect(1570, 320, 1700, 480), rect(1790, 170, 1380, 680), rect(2050, 90, 800, 820)],
      paradise: [rect(1570, 330, 1670, 360), rect(1930, 100, 980, 820), rect(1750, 210, 1370, 600)],
      hell: [rect(1540, 250, 1710, 540), rect(1770, 130, 1270, 760), rect(2000, 80, 850, 860)],
    };
    const floors = [
      rect(100, 670, 650, 270),
      rect(610, 440 + index * 12, 1150, 350),
      ...arenas[biome],
    ];
    const pillars = [
      wall(1960 + index * 12, 245, 64, 70),
      wall(1960 + index * 12, 745, 64, 70),
      wall(2930 - index * 10, 245, 64, 70),
      wall(2930 - index * 10, 745, 64, 70),
    ];
    return {
      obstacles: [...surround(boundary[biome], floors), ...pillars],
      paths: [...floors],
      enemies: [],
      boss: center,
      regions: [{ x: 1200, y: 560, name: 'THE FINAL APPROACH' }],
    };
  }
  const points: Point[] = [
    { x: 250, y: 790 },
    ...itineraries[biome][stage - 1]!.map(([x, y]) => ({ x, y })),
  ];
  const half = biome === 'mountain' ? 95 : biome === 'castle' ? 115 : 135;
  const floors = points.map((p, i) =>
    rect(p.x - half, p.y - half, half * 2 + (i === 0 ? 80 : 0), half * 2),
  );
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    floors.push(
      rect(Math.min(a.x, b.x) - 80, a.y - 80, Math.abs(a.x - b.x) + 160, 160),
      rect(b.x - 80, Math.min(a.y, b.y) - 80, 160, Math.abs(a.y - b.y) + 160),
    );
  }
  return {
    obstacles: surround(boundary[biome], floors),
    paths: road(points),
    enemies: [],
    boss: points.at(-1)!,
    regions: points
      .slice(2, -1)
      .map((p, i) => ({ ...p, name: `${STAGE_NAMES[biome][stage - 1]} · ${i + 1}`.toUpperCase() })),
  };
}
