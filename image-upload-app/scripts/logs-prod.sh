#!/bin/bash

# View production logs

if [ "$1" ]; then
    SERVICE=$1
else
    PS3="Select service to view logs: "
    options=("all" "backend" "mongodb" "exit")

    select opt in "${options[@]}"
    do
        case $opt in
            "all")
                SERVICE=""
                break
                ;;
            "backend")
                SERVICE="backend"
                break
                ;;
            "mongodb")
                SERVICE="mongodb"
                break
                ;;
            "exit")
                exit 0
                ;;
            *) echo "Invalid option";;
        esac
    done
fi

echo ""
echo "📊 Viewing logs for: ${SERVICE:-all services}"
echo "Press Ctrl+C to exit"
echo ""

if [ -z "$SERVICE" ]; then
    docker compose -f docker-compose.prod.yml logs -f
else
    docker compose -f docker-compose.prod.yml logs -f $SERVICE
fi
