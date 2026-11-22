"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupIcon,
} from "@workspace/ui/components/field"
import { Form } from "@workspace/ui/components/form"
import { Icon } from "@workspace/ui/components/icon"

/**
 * Catalogue-only demonstration of the account form pattern (Uiverse anatomy on
 * tokens). It never submits anywhere; 6.2 wires the real flows.
 */
export function FormDemo() {
  const [pending, setPending] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <Form
      aria-labelledby="form-demo-title"
      className="max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8"
      onFormSubmit={() => {
        setPending(true)
        window.setTimeout(() => setPending(false), 1200)
      }}
    >
      <div className="flex flex-col gap-2">
        <h3 id="form-demo-title" className="text-2xl font-semibold">
          Sign in to Nthawi
        </h3>
        <p className="text-sm text-muted-foreground">
          Fields marked <span aria-hidden="true" className="text-destructive">*</span>
          <span className="sr-only">with an asterisk</span> are required.
        </p>
      </div>

      <Field name="email">
        <FieldLabel required>Email</FieldLabel>
        <InputGroup>
          <InputGroupIcon>
            <Icon name="email" />
          </InputGroupIcon>
          <FieldControl
            type="email"
            required
            autoComplete="email"
            placeholder="you@business.mw"
          />
        </InputGroup>
        <FieldError match="valueMissing">Enter your email address.</FieldError>
        <FieldError match="typeMismatch">
          Enter an email address in the format name@example.com.
        </FieldError>
      </Field>

      <Field name="password">
        <div className="flex items-baseline justify-between gap-4">
          <FieldLabel required>Password</FieldLabel>
          <a href="#forgot" className="text-sm font-medium text-link underline-offset-4 hover:underline">
            Forgot password?
          </a>
        </div>
        <InputGroup>
          <InputGroupIcon>
            <Icon name="password" />
          </InputGroupIcon>
          <FieldControl
            type={showPassword ? "text" : "password"}
            required
            minLength={12}
            autoComplete="current-password"
          />
          <button
            type="button"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            className="-me-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <Icon name={showPassword ? "password-hide" : "password-show"} />
          </button>
        </InputGroup>
        <FieldDescription>At least 12 characters.</FieldDescription>
        <FieldError match="valueMissing">Enter your password.</FieldError>
        <FieldError match="tooShort">Use at least 12 characters.</FieldError>
      </Field>

      <Button type="submit" size="lg" width="full" loading={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>

      <div className="flex items-center gap-3 text-sm text-muted-foreground" role="separator" aria-label="or">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span aria-hidden="true">or</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      <Button type="button" variant="outline" size="lg" width="full">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.56-2.77c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.5 10.5 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
        </svg>
        Continue with Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to Nthawi?{" "}
        <a href="#create" className="font-medium text-link underline-offset-4 hover:underline">
          Create an account
        </a>
      </p>
    </Form>
  )
}
