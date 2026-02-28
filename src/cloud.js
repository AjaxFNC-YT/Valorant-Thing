export function exportVtFile(type, data, filename) {
  const blob = new Blob([JSON.stringify({ type, version: 1, data }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".vt") ? filename : `${filename}.vt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readVtFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.type || !parsed.data) throw new Error("Invalid .vt file");
        resolve(parsed);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
