FROM golang:1.24-alpine AS base
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

FROM base AS lint
RUN go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
RUN golangci-lint run ./...

FROM base AS test
RUN go install gotest.tools/gotestsum@latest
RUN gotestsum --junitfile /test-report.xml --format testname ./...

FROM base AS builder
# Forces the lint/test stages into the build graph so a failure here fails the image build.
COPY --from=lint /app/go.mod /tmp/.lint-ok
COPY --from=test /test-report.xml /tmp/.test-report.xml
RUN CGO_ENABLED=0 GOOS=linux go build -o /api ./cmd/api

FROM scratch AS test-report
COPY --from=test /test-report.xml /test-report.xml

FROM alpine:3.20
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /api .
EXPOSE 8080
CMD ["./api"]
