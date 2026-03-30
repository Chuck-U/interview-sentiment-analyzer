import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OptionsCard({
    children,
    title,
    description,
}: {
    children: React.ReactNode;
    title?: string;
    description?: string;
}) {
    return (
        <Card className="flex h-full min-h-0 flex-col border-l border-l-yellow-contrast/70 rounded-l-md !pt-1 pb-px ![::-webkit-scrollbar-track]:bg-transparent">
            {title && description && title === 'nope' && (
                <CardHeader className="border-b">
                    <CardTitle className="">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
            )}
            <div className="w-full px-2 pb-4 overflow-y-auto custom-scrollbar-pb20 [&>*:nth-child(odd)]:bg-background/35 [&>*:nth-child(odd)]:rounded-md">
                {children}
            </div>
        </Card>
    );
}
