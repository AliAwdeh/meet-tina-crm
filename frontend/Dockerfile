FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:3000/api/v1
ARG VITE_API_KEY=change-me
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_KEY=$VITE_API_KEY
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
