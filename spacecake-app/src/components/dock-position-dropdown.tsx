import { PanelBottom, PanelLeft, PanelRight } from "lucide-react"
import { memo } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DockablePanelKind, DockPosition } from "@/schema/workspace-layout"

interface DockPositionDropdownProps {
  currentDock: DockPosition
  onDockChange: (dock: DockPosition) => void
  label: DockablePanelKind
}

export const DockPositionDropdown = memo(function DockPositionDropdown({
  currentDock,
  onDockChange,
  label,
}: DockPositionDropdownProps) {
  const CurrentIcon =
    currentDock === "left" ? PanelLeft : currentDock === "right" ? PanelRight : PanelBottom

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-0"
          aria-label={`change ${label} dock position`}
          title={`change ${label} dock position`}
        >
          <CurrentIcon className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={currentDock === "right" ? "end" : "start"}>
        {currentDock !== "left" && (
          <DropdownMenuItem onClick={() => onDockChange("left")} className="cursor-pointer">
            <PanelLeft className="h-4 w-4" />
            dock left
          </DropdownMenuItem>
        )}
        {currentDock !== "bottom" && (
          <DropdownMenuItem onClick={() => onDockChange("bottom")} className="cursor-pointer">
            <PanelBottom className="h-4 w-4" />
            dock bottom
          </DropdownMenuItem>
        )}
        {currentDock !== "right" && (
          <DropdownMenuItem onClick={() => onDockChange("right")} className="cursor-pointer">
            <PanelRight className="h-4 w-4" />
            dock right
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
