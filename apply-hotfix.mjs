import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const bookingForm = path.join(root, "app", "app", "[businessSlug]", "online-booking", "booking-settings-form.tsx");

if (!fs.existsSync(bookingForm)) {
  console.error(`Could not find: ${bookingForm}`);
  process.exit(1);
}

let source = fs.readFileSync(bookingForm, "utf8");

if (!source.includes("useState")) {
  console.error("The booking settings file does not use useState; no import patch was applied.");
  process.exit(1);
}

if (/import\s*\{[^}]*\buseState\b[^}]*\}\s*from\s*["']react["']/.test(source)) {
  console.log("useState is already imported.");
} else if (/import\s*\{([^}]*)\}\s*from\s*["']react["']/.test(source)) {
  source = source.replace(
    /import\s*\{([^}]*)\}\s*from\s*(["'])react\2/,
    (_match, imports, quote) => {
      const names = imports.split(",").map((v) => v.trim()).filter(Boolean);
      if (!names.includes("useState")) names.push("useState");
      return `import { ${names.join(", ")} } from ${quote}react${quote}`;
    }
  );
} else {
  const directive = source.match(/^(["']use client["'];?\s*)/);
  const insertionPoint = directive ? directive[0].length : 0;
  source = source.slice(0, insertionPoint) + '\nimport { useState } from "react";\n' + source.slice(insertionPoint);
}

fs.writeFileSync(bookingForm, source);
console.log("Fixed missing useState import in booking-settings-form.tsx.");
