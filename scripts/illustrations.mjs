import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/images", { recursive: true });
const variants = {
  pho: ["#8d5a32", "#ac6750"],
  chicken: ["#b5904d", "#e7c393"],
  spicy: ["#b75027", "#a96446"],
  noodles: ["#c6a163", "#a46541"],
  rice: ["#d2b975", "#e1ae65"],
  rolls: ["#9daa72", "#e4cc9b"],
  nem: ["#d19742", "#b16d31"],
  coffee: ["#76513b", "#4a2c1e"],
};
for (const [name, [broth, meat]] of Object.entries(variants)) {
  let food = "";
  if (name === "coffee")
    food =
      '<rect x="213" y="101" width="175" height="206" rx="18" fill="#f6edcf" stroke="#c1b389" stroke-width="6"/><rect x="227" y="143" width="147" height="148" rx="9" fill="#4c3022"/><path d="M227 248h147v36H227z" fill="#cfb58a"/><path d="M395 133c96-15 94 117 0 108" fill="none" stroke="#dcd3b5" stroke-width="17"/><ellipse cx="301" cy="127" rx="89" ry="27" fill="#8a775f"/><ellipse cx="301" cy="120" rx="76" ry="23" fill="#d3c4a9"/>';
  else if (name === "rolls" || name === "nem") {
    food =
      '<ellipse cx="300" cy="205" rx="197" ry="145" fill="#fcf6e2" stroke="#d2d6bd" stroke-width="8"/>';
    for (let i = 0; i < 3; i++) {
      const x = 174 + i * 77;
      food += `<g transform="rotate(-22 ${x} 200)"><rect x="${x}" y="120" width="65" height="173" rx="29" fill="${name === "rolls" ? "#dce0ad" : "#c68b38"}" stroke="#c7c691" stroke-width="3"/>`;
      for (let j = 0; j < 6; j++)
        food += `<path d="M${x + 10} ${142 + j * 21}q22-13 45 4" stroke="${name === "rolls" ? "#74954c" : "#e6bd74"}" stroke-width="${name === "rolls" ? 11 : 4}" fill="none" opacity=".7"/>`;
      food += "</g>";
    }
  } else {
    food = `<ellipse cx="300" cy="224" rx="204" ry="160" fill="#5b6248" opacity=".15"/><ellipse cx="300" cy="203" rx="197" ry="153" fill="#e9e6d0" stroke="#fcfaef" stroke-width="17"/><ellipse cx="300" cy="201" rx="170" ry="128" fill="${broth}"/><ellipse cx="300" cy="192" rx="154" ry="111" fill="#d6b56d" opacity=".3"/>`;
    for (let i = 0; i < 27; i++) {
      const x = 187 + ((i * 37) % 210),
        y = 128 + ((i * 19) % 128);
      food += `<path d="M${x} ${y}q${i % 2 ? 50 : -50} -25 38 10t-40 30" stroke="#f0dcad" stroke-width="5" opacity=".85" fill="none" stroke-linecap="round"/>`;
    }
    for (let i = 0; i < 6; i++) {
      const x = 176 + ((i * 47) % 210),
        y = 123 + ((i * 29) % 121);
      food += `<path d="M${x} ${y}q25-16 45 7l-4 32q-29 14-50-9z" fill="${meat}" stroke="#e0b59a" stroke-width="2"/><path d="m${x + 6} ${y + 8} 28 20m-24-25 26 14" stroke="#e8c3a0" stroke-width="2" opacity=".5"/>`;
    }
    for (let i = 0; i < 35; i++) {
      const x = 161 + ((i * 71) % 282),
        y = 117 + ((i * 37) % 178);
      food += `<ellipse cx="${x}" cy="${y}" rx="${6 + (i % 5)}" ry="${3 + (i % 4)}" fill="${i % 2 ? "#476a36" : "#739052"}" transform="rotate(${i * 37} ${x} ${y})"/>`;
    }
    food +=
      '<g transform="translate(408 252) rotate(-30)"><path d="M-44 0a44 44 0 0 1 88 0z" fill="#587b36" stroke="#d9e19b" stroke-width="4"/><path d="M-35-2a35 35 0 0 1 70 0z" fill="#b7cf77"/><path d="M0-2v-32m0 32-22-23m22 23 22-23" stroke="#e8edb2" stroke-width="2"/></g><path d="M213 139q18 21 43 9m61 100q-1 24 26 28" stroke="#c44228" stroke-width="9" stroke-linecap="round" fill="none"/>';
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><defs><radialGradient id="bg"><stop stop-color="#f3efe0"/><stop offset="1" stop-color="#e5e6d7"/></radialGradient><filter id="shadow"><feDropShadow dx="2" dy="13" stdDeviation="10" flood-color="#40432a" flood-opacity=".15"/></filter><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer><feBlend mode="multiply" in2="SourceGraphic"/></filter></defs><rect width="600" height="400" fill="url(#bg)"/><g opacity=".45"><path d="M40 351Q98 285 132 283M56 348Q49 312 73 311M73 332Q109 335 107 318" fill="none" stroke="#78935b" stroke-width="6"/><path d="m447 30 50 334m-30-331 53 327" stroke="#9b6d3b" stroke-width="8" stroke-linecap="round"/></g><g filter="url(#shadow)">${food}</g><rect width="600" height="400" fill="transparent" filter="url(#grain)"/></svg>`;
  await writeFile(`public/images/${name}.svg`, svg);
}
console.log("Created eight original menu illustrations.");
