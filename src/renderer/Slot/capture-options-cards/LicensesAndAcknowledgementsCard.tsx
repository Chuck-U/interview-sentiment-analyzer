import { Separator } from "@/components/ui/separator";

type LicenseBlock = {
  readonly title: string;
  readonly license: string;
  readonly body: string;
  readonly href?: string;
  readonly linkLabel?: string;
};

const BLOCKS: readonly LicenseBlock[] = [
  {
    title: "Interview Sentiment Analyzer",
    license: "MIT License",
    body: "This application’s source code is released under the MIT License. See the LICENSE file in the repository root for the full text.",
  },
  {
    title: "@huggingface/transformers (Transformers.js)",
    license: "Apache License 2.0",
    body: "In-process speech and ML inference use Hugging Face Transformers.js. ONNX models and weights may be downloaded at runtime under their respective model licenses.",
    href: "https://github.com/huggingface/transformers.js",
    linkLabel: "transformers.js on GitHub",
  },
  {
    title: "Electron",
    license: "MIT License",
    body: "Desktop shell, native APIs, and packaging are provided by the Electron project.",
    href: "https://github.com/electron/electron",
    linkLabel: "Electron on GitHub",
  },
  {
    title: "ONNX Runtime",
    license: "MIT License",
    body: "Model execution may use the ONNX Runtime stack (including WebAssembly builds) bundled with or pulled in by ML dependencies.",
    href: "https://github.com/microsoft/onnxruntime",
    linkLabel: "ONNX Runtime on GitHub",
  },
  {
    title: "Remix Icon (@remixicon/react)",
    license: "Remix Icon License 1.0",
    body: "UI icons are from the Remix Icon set, which permits personal and commercial use under its license terms.",
    href: "https://github.com/Remix-Design/remixicon/blob/master/License",
    linkLabel: "Remix Icon license",
  },
];

export function LicensesAndAcknowledgementsCard() {
  return (
    <div className="flex flex-col gap-4 px-2 my-4">
      <div className="rounded-md border p-3">
        <p className="text-sm font-medium">Third-party software</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This app bundles and may download additional open-source components. The list below covers major runtime dependencies; run{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">pnpm licenses list</code> from the project root for a fuller
          dependency license report.
        </p>
      </div>

      {BLOCKS.map((block, index) => (
        <div key={block.title}>
          {index > 0 ? <Separator className="my-1" /> : null}
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">{block.title}</p>
              <p className="text-xs text-muted-foreground">{block.license}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{block.body}</p>
            {block.href ? (
              <a
                href={block.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {block.linkLabel ?? block.href}
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
