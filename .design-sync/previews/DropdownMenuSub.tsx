import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  Button,
  MoreHorizontal,
  Download,
  ExternalLink,
  FileDown,
  Braces,
  Database,
  Trash2,
} from 'community-archive'

export const InContext = () => (
  <DropdownMenu defaultOpen modal={false}>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="gap-2">
        <MoreHorizontal className="h-4 w-4" />
        Archive
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-48">
      <DropdownMenuItem>
        <ExternalLink className="mr-2 h-4 w-4" />
        View archive
      </DropdownMenuItem>
      <DropdownMenuSub open>
        <DropdownMenuSubTrigger>
          <Download className="mr-2 h-4 w-4" />
          Export as
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-44">
          <DropdownMenuItem>
            <Braces className="mr-2 h-4 w-4" />
            JSON
          </DropdownMenuItem>
          <DropdownMenuItem>
            <FileDown className="mr-2 h-4 w-4" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Database className="mr-2 h-4 w-4" />
            Parquet
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive focus:text-destructive">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete archive
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
