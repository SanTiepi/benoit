FROM alpine:3.19 AS builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /build
COPY pulse.c vm.c compiler.c ./
RUN gcc -O2 -o pulse pulse.c -lm && strip pulse

FROM alpine:3.19
RUN apk add --no-cache libgcc
WORKDIR /home/benoit
COPY --from=builder /build/pulse ./
COPY arena/ ./arena/
RUN chmod +x pulse
EXPOSE 3742
VOLUME ["/home/benoit/data"]

# brain.bin lives in /home/benoit/data (persistent volume)
CMD ["./pulse", "data/brain.bin", "data/brain.bin", "arena", "--inject", "arena/brain.ben"]
