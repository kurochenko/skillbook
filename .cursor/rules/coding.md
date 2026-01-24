---
name: coding
description: Best practices guide for writing code in React 19, TanStack, Convex, Zod, and Better Auth stack - focusing on simplicity, correctness, and consistency with project patterns
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: implementation
---

# Coding Skill

A comprehensive guide for writing high-quality code in modern React 19 applications using TanStack Start/Router, Convex backend, Zod validation, and Better Auth.

## When to Use

Use this skill when:

- Writing new components, hooks, or utilities
- Implementing new features
- Creating Convex functions (queries, mutations, actions)
- Building forms with validation
- Adding new routes or server functions

## Before Writing Code

### 1. Understand the Project Structure

```
src/
├── components/           # React components
│   ├── ui/              # Shadcn/base UI components
│   ├── common/          # Shared components
│   └── [feature]/       # Feature-specific components
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and helpers
│   ├── server/          # Server functions (createServerFn)
│   └── ai/              # AI-related code
├── routes/              # TanStack Router routes
│   ├── _authed/         # Authenticated routes
│   └── api/             # API routes (webhooks, external)

convex/
├── _generated/          # Auto-generated (don't edit)
├── _internal/           # Internal functions (scheduled, etc.)
├── lib/                 # Helper functions
└── *.ts                 # Public queries/mutations
```

### 2. Check Available Libraries

Before implementing, check `package.json` for existing libraries:

| Purpose       | Library                    | Import                                                 |
| ------------- | -------------------------- | ------------------------------------------------------ |
| Styling       | `class-variance-authority` | `import { cva } from 'class-variance-authority'`       |
| Class merging | `clsx` + `tailwind-merge`  | `import { cn } from '@/lib/utils'`                     |
| Icons         | `lucide-react`             | `import { IconName } from 'lucide-react'`              |
| Forms         | `@tanstack/react-form`     | `import { useForm } from '@tanstack/react-form'`       |
| Validation    | `zod`                      | `import { z } from 'zod'`                              |
| Dates         | `dayjs`                    | `import dayjs from 'dayjs'`                            |
| Toasts        | `sonner`                   | `import { toast } from 'sonner'`                       |
| Convex        | `convex`                   | `import { useQuery, useMutation } from 'convex/react'` |

### 3. Check for Existing UI Components

Before creating custom UI, check `src/components/ui/` for shadcn components:

- Button, Input, Textarea, Card, Dialog, Dropdown, Tooltip, Popover, etc.

Add new shadcn components with: `bunx shadcn@latest add <component>`

## Code Style Rules

### Formatting (Enforced by Prettier)

```typescript
// NO semicolons
const value = 'hello'

// Single quotes
const name = 'Recipe'

// Trailing commas
const obj = {
  a: 1,
  b: 2,
}
```

### Arrow Functions Everywhere

```typescript
// GOOD - Arrow function
const MyComponent = ({ title }: Props) => {
  return <div>{title}</div>
}

// GOOD - Arrow function for hooks
const useMyHook = (initialValue: string) => {
  const [value, setValue] = useState(initialValue)
  return { value, setValue }
}

// GOOD - Arrow function for utilities
const formatDate = (date: Date) => dayjs(date).format('MMM D, YYYY')

// BAD - function keyword
function MyComponent({ title }: Props) { ... }
```

### Imports Order

```typescript
// 1. External packages first
import { useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { z } from 'zod'

// 2. Local imports with @/ alias
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '~/convex/_generated/api'
```

### No Barrel Exports

```typescript
// GOOD - Direct imports
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// BAD - Barrel imports
import { Button, Card } from '@/components/ui'
```

### Minimal Comments

```typescript
// GOOD - Self-documenting code, no comment needed
const isRecipeOwner = recipe.userId === currentUser._id

// BAD - Obvious comment
// Check if user owns the recipe
const isOwner = recipe.userId === currentUser._id

// GOOD - Comment explains WHY (when necessary)
// Using 300ms delay to avoid API spam during rapid typing
const debouncedSearch = useDebouncedCallback(search, 300)
```

## React Component Patterns

### Basic Component Structure

```typescript
import { cn } from '@/lib/utils'

type RecipeCardProps = {
  recipe: Recipe
  className?: string
  onDelete?: () => void
}

export const RecipeCard = ({
  recipe,
  className,
  onDelete,
}: RecipeCardProps) => {
  return (
    <div className={cn('rounded-lg border p-4', className)}>
      <h3>{recipe.name}</h3>
      {onDelete && (
        <Button variant="ghost" onClick={onDelete}>
          Delete
        </Button>
      )}
    </div>
  )
}
```

### Component with Variants (CVA)

```typescript
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants>

export const Badge = ({ className, variant, ...props }: BadgeProps) => {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}
```

### Custom Hook Pattern

```typescript
import { useState, useCallback } from 'react'

export const useToggle = (initialValue = false) => {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => setValue((v) => !v), [])
  const setTrue = useCallback(() => setValue(true), [])
  const setFalse = useCallback(() => setValue(false), [])

  return { value, toggle, setTrue, setFalse }
}
```

## Convex Patterns

### Query with Access Control

```typescript
import { v } from 'convex/values'
import { authedQuery } from './functions'

export const getById = authedQuery({
  args: {
    id: v.id('recipes'),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.id)
    if (!recipe) return null
    if (recipe.userId !== ctx.user._id) return null
    return recipe
  },
})
```

### Mutation with Validation

```typescript
import { v } from 'convex/values'
import { authedMutation } from './functions'
import { getOwnedRecipe } from './lib/access'

export const updateName = authedMutation({
  args: {
    id: v.id('recipes'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await getOwnedRecipe(ctx, args.id) // Throws if not owned
    await ctx.db.patch(args.id, { name: args.name })
  },
})
```

### Helper Functions in lib/

```typescript
// convex/lib/access.ts
import { notFound } from './errors'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type AuthedCtx = (QueryCtx | MutationCtx) & { user: { _id: string } }

export const getOwnedRecipe = async (
  ctx: AuthedCtx,
  recipeId: Id<'recipes'>,
): Promise<Doc<'recipes'>> => {
  const recipe = await ctx.db.get(recipeId)
  if (!recipe || recipe.userId !== ctx.user._id) {
    throw notFound('Recipe')
  }
  return recipe
}
```

### Using Indexes (Not .filter())

```typescript
// GOOD - Use index
const recipes = await ctx.db
  .query('recipes')
  .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
  .collect()

// BAD - Using .filter()
const recipes = await ctx.db
  .query('recipes')
  .filter((q) => q.eq(q.field('userId'), ctx.user._id))
  .collect()
```

## Zod Validation Patterns

### Schema Definition

```typescript
import { z } from 'zod'

export const recipeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  prepTimeMins: z.number().int().positive().optional(),
  servings: z.number().int().positive().optional(),
})

export type Recipe = z.infer<typeof recipeSchema>
```

### Form Validation

```typescript
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// Use with TanStack Form or manual validation
const result = loginSchema.safeParse(formData)
if (!result.success) {
  // Handle errors
  console.error(result.error.flatten())
}
```

## TanStack Router Patterns

### Route with Loader

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/recipe/$id')({
  loader: async ({ params, context }) => {
    // Loader runs on server
    return { recipeId: params.id }
  },
  component: RecipeDetailPage,
})

const RecipeDetailPage = () => {
  const { recipeId } = Route.useLoaderData()
  // ...
}
```

### Server Function (Preferred over API Routes)

```typescript
// src/lib/server/recipes.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

const inputSchema = z.object({
  recipeId: z.string(),
})

export const getRecipeServer = createServerFn('GET', async (input) => {
  const { recipeId } = inputSchema.parse(input)
  // Server-side logic here
  return { recipe: ... }
})
```

## Error Handling

### Convex Errors

```typescript
// convex/lib/errors.ts
export const notFound = (entity: string) => {
  throw new Error(`${entity} not found`)
}

export const unauthorized = () => {
  throw new Error('Unauthorized')
}

// Usage
import { notFound, unauthorized } from './lib/errors'

if (!recipe) throw notFound('Recipe')
if (recipe.userId !== ctx.user._id) throw unauthorized()
```

### Client-Side Error Handling

```typescript
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import { api } from '~/convex/_generated/api'

const MyComponent = () => {
  const deleteRecipe = useMutation(api.recipes.remove)

  const handleDelete = async (id: string) => {
    try {
      await deleteRecipe({ id })
      toast.success('Recipe deleted')
    } catch (error) {
      toast.error('Failed to delete recipe')
    }
  }
}
```

## Key Principles

### Keep It Simple

```typescript
// GOOD - Simple and clear
const isExpired = expirationDate < new Date()

// BAD - Over-engineered
const isExpired = DateUtils.compare(expirationDate, DateUtils.now()) < 0
```

### Single Responsibility

```typescript
// GOOD - Each function does one thing
const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`
const calculateTax = (cents: number) => Math.round(cents * 0.1)
const calculateTotal = (cents: number) => cents + calculateTax(cents)

// BAD - Function does too much
const processPrice = (cents: number, options: ProcessOptions) => {
  // 50 lines of mixed logic
}
```

### Early Returns

```typescript
// GOOD - Early returns reduce nesting
const getRecipe = async (id: string) => {
  const recipe = await ctx.db.get(id)
  if (!recipe) return null
  if (recipe.userId !== userId) return null
  return recipe
}

// BAD - Deep nesting
const getRecipe = async (id: string) => {
  const recipe = await ctx.db.get(id)
  if (recipe) {
    if (recipe.userId === userId) {
      return recipe
    }
  }
  return null
}
```

### Immutability

```typescript
// GOOD - Immutable updates
const updatedRecipes = recipes.map((r) =>
  r.id === id ? { ...r, name: newName } : r,
)

// BAD - Mutation
recipes.find((r) => r.id === id).name = newName
```

## Before Submitting Code

1. Run `bun run check` to fix formatting and lint issues
2. Ensure no TypeScript errors
3. Test the feature manually
4. Check for console.log statements (remove them)
5. Verify imports are correct (no barrel imports)
6. Ensure code follows project patterns (check similar files)
