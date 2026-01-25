import { Box, Text } from 'ink'

export type ConfirmAction = {
  message: string
  onConfirm: () => void
}

type ConfirmDialogProps = {
  action: ConfirmAction
}

export const ConfirmDialog = ({ action }: ConfirmDialogProps) => {
  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      paddingY={0}
      marginTop={1}
      flexDirection="column"
    >
      <Text>{action.message}</Text>
      <Text dimColor>[y]es  [n]o</Text>
    </Box>
  )
}
