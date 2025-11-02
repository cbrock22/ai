#!/bin/bash

# Script to clean up Docker resources

echo "🧹 Docker Cleanup Utility"
echo ""

PS3="Select an option: "
options=(
    "Stop all containers"
    "Remove stopped containers"
    "Remove unused images"
    "Remove unused volumes"
    "Full cleanup (containers + images + volumes)"
    "Reset project (remove project containers and volumes)"
    "Exit"
)

select opt in "${options[@]}"
do
    case $opt in
        "Stop all containers")
            echo "Stopping all containers..."
            docker stop $(docker ps -q) 2>/dev/null || echo "No running containers"
            ;;
        "Remove stopped containers")
            echo "Removing stopped containers..."
            docker container prune -f
            ;;
        "Remove unused images")
            echo "Removing unused images..."
            docker image prune -a -f
            ;;
        "Remove unused volumes")
            echo "Removing unused volumes..."
            docker volume prune -f
            ;;
        "Full cleanup (containers + images + volumes)")
            echo "⚠️  This will remove all stopped containers, unused images, and volumes"
            read -p "Are you sure? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo "Cleaning up..."
                docker system prune -a --volumes -f
                echo "✅ Cleanup complete!"
            else
                echo "Cancelled"
            fi
            ;;
        "Reset project (remove project containers and volumes)")
            echo "⚠️  This will remove all project-specific containers and volumes"
            read -p "Are you sure? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo "Stopping project containers..."
                docker-compose down -v 2>/dev/null
                docker-compose -f docker-compose.dev.yml down -v 2>/dev/null
                echo "✅ Project reset complete!"
            else
                echo "Cancelled"
            fi
            ;;
        "Exit")
            break
            ;;
        *) echo "Invalid option $REPLY";;
    esac
done
