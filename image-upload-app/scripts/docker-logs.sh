#!/bin/bash

# Script to view Docker container logs

echo "📊 Docker Logs Viewer"
echo ""

if [ "$1" ]; then
    # Service name provided as argument
    SERVICE=$1
else
    # Interactive menu
    PS3="Select a service to view logs: "
    options=("backend" "mongodb" "mongo-express" "frontend (dev only)" "all" "exit")

    select opt in "${options[@]}"
    do
        case $opt in
            "backend")
                SERVICE="backend"
                break
                ;;
            "mongodb")
                SERVICE="mongodb"
                break
                ;;
            "mongo-express")
                SERVICE="mongo-express"
                break
                ;;
            "frontend (dev only)")
                SERVICE="frontend"
                break
                ;;
            "all")
                SERVICE=""
                break
                ;;
            "exit")
                exit 0
                ;;
            *) echo "Invalid option";;
        esac
    done
fi

# Check which compose file is being used
if docker ps | grep -q "image-upload.*-dev"; then
    COMPOSE_FILE="-f docker-compose.dev.yml"
else
    COMPOSE_FILE=""
fi

echo ""
echo "📖 Showing logs for: ${SERVICE:-all services}"
echo "Press Ctrl+C to exit"
echo ""

if [ -z "$SERVICE" ]; then
    docker-compose $COMPOSE_FILE logs -f
else
    docker-compose $COMPOSE_FILE logs -f $SERVICE
fi
