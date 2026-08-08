package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const pgUniqueViolation = "23505"

// ErrEmailTaken is returned when registering with an email that already exists.
var ErrEmailTaken = errors.New("email already registered")

// ErrUserNotFound is returned when no user matches the given lookup.
var ErrUserNotFound = errors.New("user not found")

// User is a row from the users table.
type User struct {
	ID           string
	Email        string
	PasswordHash string
}

// Store persists and retrieves users from PostgreSQL.
type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// CreateUser inserts a new user with the given email and pre-hashed password, returning its ID.
func (s *Store) CreateUser(ctx context.Context, email, passwordHash string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
		email, passwordHash,
	).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			return "", ErrEmailTaken
		}
		return "", err
	}
	return id, nil
}

// GetUserByEmail looks up a user by email.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// GetUserByID looks up a user by ID.
func (s *Store) GetUserByID(ctx context.Context, id string) (*User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}
