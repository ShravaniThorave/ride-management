# 🚗 AI-Powered Smart Ride Management System

An AI-powered ride management system inspired by platforms like Uber and Ola, developed as a **DBMS Mini Project**.

The project focuses on designing and implementing a relational ride-management system using **Node.js, Express.js, MySQL, and Google Gemini API**, with authentication, ride management, driver/passenger workflows, database operations, and AI-powered assistance.

> **Note:** This is an academic project. It does not implement real-time GPS tracking or a real payment gateway.

---

## ✨ Features

### 👤 Passenger

- User registration and login
- Book a ride
- Fare estimation
- View ride status
- View ride history
- Simulated payment
- Rate drivers
- Raise support tickets

### 🚘 Driver

- Driver login
- Online/offline availability
- View ride requests
- Accept or reject rides
- Start rides
- Complete rides
- View ride-related earnings

### 🤖 AI Features

- AI-powered Ride Assistant
- Natural-language interaction with ride-related information
- AI-assisted support/complaint classification
- AI-generated responses for support-related queries
- Google Gemini API integration

### 🗄️ Database Features

The project demonstrates important DBMS concepts including:

- Relational database design
- Primary Keys and Foreign Keys
- Constraints
- Normalization
- SQL Joins
- Aggregate queries
- Views
- Stored Procedures
- Triggers
- Transactions
- Indexing
- Referential integrity

---

## 🛠️ Tech Stack

### Frontend

- HTML
- CSS
- JavaScript

### Backend

- Node.js
- Express.js

### Database

- MySQL

### AI

- Google Gemini API

### API Documentation

- Swagger / OpenAPI

### Development Tools

- Git
- GitHub
- VS Code
- Postman

---

## 🏗️ System Architecture

```text
                    ┌─────────────────────┐
                    │      Frontend       │
                    │    HTML / CSS / JS  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Express.js API   │
                    │       Node.js       │
                    └───────┬─────┬───────┘
                            │     │
                 ┌──────────┘     └──────────┐
                 ▼                           ▼
        ┌─────────────────┐        ┌─────────────────┐
        │      MySQL      │        │    Gemini API   │
        │     Database    │        │  AI Assistant   │
        └─────────────────┘        └─────────────────┘