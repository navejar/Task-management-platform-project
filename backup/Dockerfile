FROM postgres:16-alpine

RUN apk add --no-cache bash s3cmd

WORKDIR /app

COPY scripts/backup.sh /app/backup.sh
RUN chmod +x /app/backup.sh

CMD ["/app/backup.sh"]