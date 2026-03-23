import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { RiCheckboxCircleLine, RiInformationLine, RiErrorWarningLine, RiCloseCircleLine, RiLoaderLine } from "@remixicon/react"
import { cn } from "@/lib/utils"

type ExpandedToasterProps = ToasterProps & {
  options?: {
    iconSize?: string;
    containerClassName?: string;
    toastClassName?: string;
    toastMessageClassName?: string;
    toastDescriptionClassName?: string;
    toastTitleClassName?: string;
    toastActionClassName?: string;
    toastActionIconClassName?: string;
    toastActionTextClassName?: string;
  }
  icons?: {
    success?: React.ReactNode;
    info?: React.ReactNode;
    warning?: React.ReactNode;
    error?: React.ReactNode;
    loading?: React.ReactNode;
  }
}


const Toaster = ({ ...props }: ExpandedToasterProps) => {
  const { theme = "system" } = useTheme()
  const icons = {
    success: <RiCheckboxCircleLine className={cn("size-4", props.options?.iconSize)} />,
    info: <RiInformationLine className={cn("size-4", props.options?.iconSize)} />,
    warning: <RiErrorWarningLine className={cn("size-4", props.options?.iconSize)} />,
    error: <RiCloseCircleLine className={cn("size-4", props.options?.iconSize)} />,
    loading: <RiLoaderLine className={cn("size-4 animate-spin", props.options?.iconSize)} />,
  }


  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={icons}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
